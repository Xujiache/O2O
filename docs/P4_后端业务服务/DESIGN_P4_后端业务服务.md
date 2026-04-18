# DESIGN_P4_后端业务服务

## 一、模块划分

```
后端/src/modules/
├── shop/            # 店铺、营业时间、配送区域
├── product/         # 分类、商品、SKU、套餐、库存
├── marketing/       # 优惠券、活动、红包、积分
├── order/           # 订单状态机、下单、查询（含 takeout/errand）
├── dispatch/        # 智能派单、抢单、转单、顺路单
├── payment/         # 微信/支付宝/余额
├── finance/         # 分账、账户、流水、提现、发票、对账
├── review/          # 评价、申诉、投诉、仲裁、售后工单
└── orchestration/   # 跨模块事件订阅 + Saga 协调
```

## 二、Order 模块核心设计

### 2.1 关键接口（按端）

**用户端**：
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/user/order/takeout/pre-check` | 下单前校验（配送范围/库存/优惠计算） |
| POST | `/api/v1/user/order/takeout` | 创建外卖订单（待支付） |
| POST | `/api/v1/user/order/errand` | 创建跑腿订单（待支付） |
| POST | `/api/v1/user/order/errand/price` | 跑腿价格预估 |
| GET  | `/api/v1/user/order/:orderNo` | 订单详情 |
| GET  | `/api/v1/user/orders` | 订单列表（按状态/类型） |
| POST | `/api/v1/user/order/:orderNo/cancel` | 取消订单 |
| POST | `/api/v1/user/order/:orderNo/confirm-receive` | 确认收货 |
| POST | `/api/v1/user/order/:orderNo/re-order` | 再来一单 |

**商户端**：
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/merchant/order/:orderNo/accept` | 接单 |
| POST | `/api/v1/merchant/order/:orderNo/reject` | 拒单（reason） |
| POST | `/api/v1/merchant/order/:orderNo/ready` | 出餐完成 |
| POST | `/api/v1/merchant/order/:orderNo/print` | 打印小票 |
| GET  | `/api/v1/merchant/orders` | 订单列表 |

**骑手端**：
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/rider/order/:orderNo/pickup` | 取件/取餐（需核验取件码） |
| POST | `/api/v1/rider/order/:orderNo/deliver` | 送达 |
| POST | `/api/v1/rider/order/:orderNo/abnormal` | 异常上报 |
| POST | `/api/v1/rider/order/:orderNo/transfer` | 转单申请 |

**管理端**：
| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/api/v1/admin/orders` | 全量查询 |
| POST | `/api/v1/admin/order/:orderNo/force-cancel` | 强制取消 |
| POST | `/api/v1/admin/order/:orderNo/arbitrate` | 仲裁 |

### 2.2 状态机实现
```ts
@Injectable()
class OrderStateMachine {
  transit(order, event, ctx): Result {
    // 1. 校验 from→to 合法性（查配置表/静态 Map）
    // 2. 分布式锁 lock:order:{orderNo}
    // 3. 事务：update order + insert order_status_log
    // 4. 事件发布到 RabbitMQ order.events
    // 5. 释放锁
  }
}
```

### 2.3 超时关单
- 待支付 15min → `order:paytimeout:{orderNo}` Redis ZSet，定时扫
- 待接单 5min → `order:accepttimeout:{orderNo}` 同上
- BullMQ delayed queue 二级保障

### 2.4 下单幂等
- 前端提交 `X-Idem-Key`；后端 `SETNX idem:order:{key}` TTL 10min，重复返回已创建订单

## 三、Product 模块

### 3.1 接口
- 商户端：`CRUD /api/v1/merchant/products`、`CRUD /api/v1/merchant/product-categories`
- 用户端：`GET /api/v1/shop/:shopId/products`、`GET /api/v1/products/:id`
- 管理端：`GET /api/v1/admin/products`、`POST /api/v1/admin/product/:id/force-off`

### 3.2 库存操作
- `InventoryService.deduct(skuId, n)` → Redis Lua 原子扣减 + 负值回滚
- `InventoryService.restore(skuId, n)` → Redis `INCRBY`
- 事务兜底：MySQL CAS `WHERE stock>=n`

## 四、Shop 模块

### 4.1 接口
- 商户端：店铺信息 CRUD、营业时间、配送区域、自动接单开关、公告
- 用户端：`GET /api/v1/shops`（按城市、位置、排序）、`GET /api/v1/shops/:id`
- 管理端：审核、封禁、公告审核

### 4.2 店铺列表查询
- 入参：`cityCode, lng, lat, sort=distance|sales|score|price, filter`
- 先走 Redis 缓存 `shop:list:{cityCode}:{hash(params)}`（2min）
- 未命中：查 shop + 按 GEO 计算距离 + 排序 + 分页 + 写缓存

### 4.3 自动接单
- 开启时，支付成功事件到达 → 自动调 `order.accept`（仅营业中 + 库存满足）

## 五、Dispatch 模块

### 5.1 接口
- 骑手端：`GET /api/v1/rider/dispatch/list`（抢单池）、`POST /api/v1/rider/dispatch/:orderNo/grab`、`POST /api/v1/rider/preference`（模式/偏好）
- 内部：订阅 `OrderPaid`(跑腿) / `OrderReady`(外卖) → 触发派单
- 管理端：运力看板、强制派单、转单审核

### 5.2 派单流程（系统派单）
```
1. 收到事件 → 加锁 lock:dispatch:{orderNo}
2. 候选骑手：Redis GEORADIUS rider:online:{cityCode} 3km (可配置)
3. 过滤：接单模式/类型偏好/运力上限/黑名单
4. 打分排序 → Top1
5. 推送消息 + 写 dispatch_record
6. 等待 15s：响应超时 → 下一个
7. 3 次失败 → 进入抢单池
8. 5 次仍无人 → 上报异常，进入客服
```

### 5.3 顺路单
- 骑手配送中 = 有 1~N 个未完成订单
- 新订单分派时，若骑手候选集中存在"进行中骑手"，计算：
  - 起点夹角 ≤ 45°、距离增量 ≤ 1.5km → 顺路
- 顺路骑手 `routeMatchScore` 加权更高

### 5.4 派单调度 Worker
- BullMQ queue `dispatch-retry` 延迟 15s 自动 re-queue
- 同时监听骑手离线/拒单事件 → 立即 re-dispatch

## 六、Payment 模块

### 6.1 接口
- `POST /api/v1/payment/create`（入参 orderNo + method；返回前端 JSAPI 参数）
- `POST /api/v1/payment/wx/notify`（微信回调）
- `POST /api/v1/payment/alipay/notify`（支付宝回调）
- `POST /api/v1/payment/balance/pay`（余额支付）
- `POST /api/v1/payment/refund`（内部）

### 6.2 微信支付 V3 接入
- 证书：APIv3 key + 平台证书（自动刷新）
- 签名：HMAC-SHA256
- 回调验签：响应 `{"code":"SUCCESS"}`

### 6.3 对账
- 每日 02:00 拉取昨日微信/支付宝对账单 → 入 `reconciliation`
- 差异订单打标 → 人工核查

## 七、Finance 模块

### 7.1 接口
- 商户端：概览、账单明细、提现、发票申请
- 骑手端：概览、收入明细、奖励/罚款、提现
- 用户端：余额、明细、发票
- 管理端：分账规则 CRUD、分账执行监控、提现审核、对账

### 7.2 分账规则示例
```json
[
  { "scene": 1, "target": "merchant", "scope": "global", "rate": 0.85 },
  { "scene": 1, "target": "rider",    "scope": "global", "rate": 0.10 },
  { "scene": 1, "target": "platform", "scope": "global", "rate": 0.05 },
  { "scene": 2, "target": "rider",    "scope": "global", "rate": 0.85 },
  { "scene": 2, "target": "platform", "scope": "global", "rate": 0.15 }
]
```
支持按城市 override。

### 7.3 提现审核流程
用户/商户/骑手申请 → 初审（运营）→ 财务复审 → 打款 → 回写状态；金额从 `account.balance` 冻结 → 成功后减余额

## 八、Marketing 模块

### 8.1 接口
- 用户端：`GET /api/v1/me/coupons`、`POST /api/v1/coupon/:id/receive`、`POST /api/v1/coupon/best-match`（下单时推荐最优）
- 商户端：店铺优惠券、满减、折扣配置
- 管理端：平台券、红包池、活动 CRUD、发放数据统计

### 8.2 优惠券计算
```ts
interface DiscountContext {
  order: Order;
  coupons: UserCoupon[];  // 用户选中
  promotions: Promotion[]; // 店铺活动
}
class DiscountCalc {
  calc(ctx): { finalAmount, details } {
    // 1. 过滤可用：scope / scene / 时间 / 阈值
    // 2. 排序策略：最大金额优先
    // 3. 应用互斥规则：同类不可叠加
    // 4. 返回明细 + 最终金额（≥ 0）
  }
}
```

### 8.3 发放
- 手动：管理后台批量发放（异步队列）
- 触发式：新客礼（注册事件）、邀请（邀请成功事件）、生日、订单返券
- 红包分发：`RedPacketService.grab(userId, packetId)` Redis 事务保证原子

## 九、Review 模块

### 9.1 接口
- 用户端：评价提交、我的评价、售后申请、投诉
- 商户端：查看评价、回复、申诉
- 骑手端：查看差评、申诉
- 管理端：违规评价处理、售后仲裁、投诉分派、工单管理

### 9.2 评价规则
- 订单 `finished_at` 后 15 天内可评
- 一单一评（`uk_order`）
- 提交后 24h 内可修改，之后锁定

### 9.3 申诉 & 仲裁
- 商户/骑手 7 天内可对差评/处罚申诉 → 平台审核 → 改判/维持
- 仲裁结果写 `arbitration`，关联 `order_after_sale`

## 十、Orchestration 模块（跨模块编排）

订阅 `order.events`，执行副作用：
- `OrderPaid` → Dispatch 触发、Marketing 核销优惠券、Message 推送
- `OrderFinished` → Review 打开评价权限、Finance 生成分账记录、Marketing 返利
- `OrderCanceled` → Payment 触发退款、Inventory 回补、Marketing 回退优惠券
- `RefundSucceed` → Finance 反向分账、Message 通知

Saga 模式保证最终一致性：每步失败进入 DLQ 手工补偿。

## 十一、通用错误码（业务层）
- `10100` 参数错误 / `10101` 配送范围外 / `10102` 超出起送价
- `10200` 库存不足 / `10201` 商品已下架 / `10202` 店铺打烊
- `10300` 订单不存在 / `10301` 状态不允许 / `10302` 非本人订单
- `10400` 支付失败 / `10401` 重复支付 / `10402` 余额不足
- `10500` 退款失败 / `10501` 超出可退额
- `10600` 无可派骑手 / `10601` 派单超时
- `10700` 优惠券不适用 / `10701` 已使用 / `10702` 已过期
- `10800` 评价不在有效期

## 十二、Swagger 分组
- `/docs/user`、`/docs/merchant`、`/docs/rider`、`/docs/admin`、`/docs/internal`
