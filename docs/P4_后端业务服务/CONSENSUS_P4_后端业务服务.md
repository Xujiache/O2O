# CONSENSUS_P4_后端业务服务

## 一、范围共识
- 8 个 NestJS 模块 + 1 个跨模块编排服务 `orchestration`
- 全量服务纳入 Swagger
- 全量关键写操作入 `operation_log`
- 订单状态机在 `order` 模块统一管理，其他模块通过事件驱动

## 二、技术方案共识

### 2.1 订单状态机
**外卖 status 枚举**：0 待支付 / 10 待接单 / 20 已接单待出餐 / 30 出餐待取 / 40 配送中 / 50 已完成 / 60 已取消 / 70 售后中

**跑腿 status 枚举**：0 待支付 / 10 待接单 / 20 已接单 / 30 已取件 / 40 配送中 / 50 已完成 / 60 已取消 / 70 售后中

变迁表（外卖示例）：
| from → to | 触发 | 校验 |
|---|---|---|
| 0 → 10 | 支付成功回调 | 幂等 pay_no；订单未过期 |
| 0 → 60 | 用户取消/超时 | 仅 0/未支付 |
| 10 → 20 | 商户接单 | 仅 10；营业中 |
| 10 → 60 | 商户拒单 | 仅 10；原因必填 + 触发退款 |
| 20 → 30 | 商户出餐完成 | 仅 20 |
| 20/30 → 40 | 骑手取餐 | 存在骑手分配；取件扫描 |
| 40 → 50 | 骑手送达 + 用户确认 或 超时自动 | - |
| 20/30/40 → 70 | 用户申请售后 | - |

所有状态变更由 `OrderStateMachine.transit()` 处理；写入 `order_status_log`；发事件 `OrderStatusChanged` 到 RabbitMQ 广播。

### 2.2 库存扣减
- 下单：Redis `stock:sku:{skuId}` `DECRBY n`（原子）；负值回滚 + 抛错
- 支付成功：MySQL 实际扣减 `UPDATE product_sku SET stock=stock-n WHERE id=? AND stock>=n`
- 取消/退款：Redis + DB 同步加回
- `stock=-1` 表示无限库存（跳过校验）

### 2.3 智能派单算法（核心）
输入：一笔可派订单（外卖或跑腿）+ 候选骑手集合（在线 & 接单模式兼容 & 位置半径内）

评分公式：
```
score = w1 * distanceScore
      + w2 * capacityScore
      + w3 * routeMatchScore
      + w4 * riderRatingScore
      - penalty
```
- `distanceScore`：距离越近越高（exp 衰减）
- `capacityScore`：当前进行中订单数越少越高
- `routeMatchScore`：若骑手已有订单，计算顺路夹角 & 距离差
- `riderRatingScore`：骑手评分 / 投诉率
- `penalty`：超时未响应、近 2h 被拒次数

派单模式：
- **抢单模式**：推送到候选集合（最多 20 个），Redis List 抢占
- **系统派单**：选 Top1 推送；响应超时 15s 自动下一个
- **顺路单**：骑手已有配送中订单时，优先推送顺路候选

### 2.4 支付对接
- 微信支付 V3 API：JSAPI（小程序）、APP、Native（备用）
- 支付宝 OpenAPI：WAP / APP
- 统一 `PaymentService.create(order, method)` → 返回预支付参数
- 回调：`POST /api/v1/payment/wx/notify`、`/alipay/notify` 统一调 `PaymentService.handleCallback`
- 幂等：`out_trade_no` 唯一；重复回调返回成功
- 超时：15min 未支付 → 关单（BullMQ delayed queue）

### 2.5 退款
- 用户申请 → `order_after_sale` 工单
- 商户/平台同意 → 调 `RefundService.refund(pay_no, amount, reason)`
- 三方退款异步回调 → 更新 `refund_record.status=成功`
- 同步更新 `payment_record.status`（已退款/部分退款）
- 触发 `settlement_record` 反向冲账 + `account_flow` 流入/流出

### 2.6 分账
- 触发时机：订单 `finished_at + 1day` 定时任务
- 步骤：
  1. 读取有效 `settlement_rule`
  2. 计算商户应得 / 骑手应得 / 平台留存
  3. 写 `settlement_record status=0 待结算`
  4. 执行（内部账户转账）：`account_flow` 记录；`account.balance` 乐观锁更新
  5. 标记 `status=1 已结算`

### 2.7 价格计算（跑腿）
```
价格 = 起步价 + max(0, 距离-起步距离) * 每公里费
     + 重量超重附加
     + 夜间加价(%)   // 22:00 - 06:00
     + 恶劣天气加价(%) // 运营开关
     + 保价费
价格 * 服务类型系数(帮买有商品费预估)
```
配置：`sys_config.key = dispatch.pricing.{cityCode}`（JSON）

### 2.8 营销规则引擎
- 优惠券使用：`CouponCalc.apply(order, coupon)` 返回 `discount`
- 互斥策略：优惠券/满减/折扣三选一 或 可叠加（配置化）
- 拼单：`PromotionService.joinGroup(userId, productId)` → Redis Set 计数，达人数触发合并订单

### 2.9 事件总线
| 事件 | 生产者 | 消费者 |
|---|---|---|
| `OrderPaid` | payment | order/marketing/dispatch |
| `OrderAccepted` | order(商户) | dispatch/message |
| `OrderReady` | order(商户) | dispatch/message |
| `OrderPicked` | order(骑手) | message/delivery-track |
| `OrderDelivered` | order(骑手) | message/settlement |
| `OrderFinished` | order(用户/系统) | finance/marketing/review |
| `OrderCanceled` | order | inventory/payment/marketing |
| `RefundSucceed` | payment | finance/order |
| `ReviewSubmitted` | review | shop/rider(统计) |

基于 RabbitMQ Topic Exchange `order.events`，消费者幂等（按 messageId）。

## 三、交付标准
- [ ] 外卖主流程端到端闭环可跑通（无前端时用 Postman）
- [ ] 跑腿 4 种服务类型各自闭环
- [ ] 支付/退款/分账/提现全链路真实沙箱可调通
- [ ] 单测覆盖 ≥ 70%
- [ ] 集成测试：外卖闭环 + 跑腿闭环 2 个大用例

## 四、风险
| 风险 | 应对 |
|---|---|
| 超卖 | Redis 原子 + DB CAS 兜底；下单与支付库存双锁 |
| 回调重放 | out_trade_no 唯一 + 幂等 |
| 状态机错乱 | 统一 transit，事务中写库 + 日志 |
| 派单性能 | 候选集控制在 100 以内，核心函数 O(n log n) |
| 分账不一致 | 事务 + 账户乐观锁 + 对账任务修复 |
| 优惠叠加滥用 | 计算层统一互斥校验；key = orderId 幂等 |

## 五、结论
- 8 大服务方案锁定，进入 DESIGN 阶段
