# Redis Key 命名与场景规范

> 阶段：P2 数据库设计 / T2.18
> 用途：固化全平台 Redis Key 命名空间、类型、TTL、读写点
> 依据：DESIGN*P2*数据库设计.md §七、CONSENSUS §2.4
> 部署：Redis 7 单实例（部署/docker-compose.dev.yml `o2o-redis`），生产 Cluster

---

## 一、命名规范（强制）

| 项       | 规范                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 字符集   | **小写英文 + 数字 + `:` 分隔**；禁中文/驼峰/下划线                                                                                                                                 |
| 业务前缀 | 必填，按业务域取：`auth/user/merchant/rider/shop/product/stock/order/cart/dispatch/lock/rl/idem/rank/search/cms/coupon/redpkt/sms/push/signin/ws/stat/region/dict/config/favorite` |
| 命名模板 | `<biz>:<sub>:<param1>[:<param2>]`；占位符用 `{}` 文档表达                                                                                                                          |
| 长度     | 推荐 ≤ 100 字符；超长改 hash key                                                                                                                                                   |
| 大 Value | Value 估算 > 10KB 一律拆分为 Hash 多 field 或多个 key                                                                                                                              |
| 扫描     | **严禁 `KEYS *` / `SMEMBERS` 大集合**；统一 `SCAN COUNT 100` 迭代                                                                                                                  |
| 删除     | 大 key 删除走 `UNLINK`（异步），不用 `DEL`                                                                                                                                         |
| TTL      | 强制设置（`PERSIST` 仅限白名单：库存/排行榜/配置）                                                                                                                                 |
| 序列化   | JSON 字符串（默认）；高频 Hash 用 HSET 字段；二进制需 base64                                                                                                                       |
| 数据库   | 全平台共享 db=0；统计/审计可改 db=1（避免 FLUSHDB 误伤）                                                                                                                           |
| 多租户   | 后续若开启，所有 key 加 `t{tenantId}:` 前缀；本期默认 t1 隐含                                                                                                                      |

---

## 二、Key 全量场景表（**47 项**）

> 类型 = String / Hash / List / Set / ZSet / Bitmap / Stream / GEO

### A. 认证与会话（5 项）

| 编号 | Key 模板                           | 类型    | TTL                       | 写入点                  | 读取点                 | 示例值                              |
| ---- | ---------------------------------- | ------- | ------------------------- | ----------------------- | ---------------------- | ----------------------------------- |
| K01  | `auth:token:{userType}:{userId}`   | String  | JWT_EXPIRES_IN（默认 2h） | AuthService.login       | AuthGuard              | `eyJhbGc...`                        |
| K02  | `auth:refresh:{userType}:{userId}` | String  | 7d                        | AuthService.login       | AuthService.refresh    | `<refresh-token>`                   |
| K03  | `auth:sms:{mobileHash}`            | String  | 5min                      | AuthController.sendSms  | AuthService.verifySms  | `123456`                            |
| K04  | `auth:loginfail:{mobileHash}`      | Integer | 30min                     | AuthService.login(失败) | AuthGuard 拒绝         | `5`                                 |
| K05  | `auth:device:{userId}`             | Set     | 30d                       | AuthService.login       | AuthService.deviceList | `{"device-uuid-1","device-uuid-2"}` |

### B. 用户/商户/骑手画像缓存（5 项）

| K06 | `user:info:{userId}` | Hash | 30min | UserService.getProfile / 更新时 DEL | UserController/JWT 强校验 | `{nickname,...,mobile_tail4}` |
| K07 | `merchant:info:{merchantId}` | Hash | 30min | MerchantService.get | MerchantController | `{name,industry,...}` |
| K08 | `rider:info:{riderId}` | Hash | 30min | RiderService.get | RiderController | `{name_tail,level,...}` |
| K09 | `favorite:shop:{userId}` | Set | 7d | UserService.toggleFavorite | UserController.list | `{shopId1,shopId2}` |
| K10 | `favorite:product:{userId}` | Set | 7d | 同上 | 同上 | `{productId1,...}` |

### C. 店铺/商品（4 项）

| K11 | `shop:detail:{shopId}` | Hash | 10min | ShopService.get | ShopController | `{name,...,score,monthly_sales}` |
| K12 | `shop:list:{cityCode}:{page}` | String(JSON) | 2min | ShopService.searchList | ShopController.list | `[{shopId,name,...}]` |
| K13 | `product:detail:{productId}` | Hash | 10min | ProductService.get | ProductController | `{name,price,sales,...}` |
| K14 | `product:list:{shopId}:{categoryId}` | String(JSON) | 5min | ProductService.list | ShopDetailPage | `[{productId,name,price}]` |

### D. 库存（1 项 + 锁）

| K15 | `stock:sku:{skuId}` | Integer | **永久** | OrderService.deduct(原子 DECR) / Admin 调整 | OrderService.preCheck | `42` |

### E. 订单/购物车（5 项）

| K16 | `order:status:{orderNo}` | Hash | 7d | OrderService.transition | OrderController.detail | `{status:40,...}` |
| K17 | `order:paytimeout:{orderNo}` | String | 15min | OrderService.create | PayTimeoutWorker SCAN | `1` |
| K18 | `order:idempotent:{userId}:{requestId}` | String | 10min | OrderController.create(预占) | 同上(防重) | `{orderNo}` |
| K19 | `cart:{userId}:{shopId}` | Hash | 7d | CartService.add/update | CartController.list | `{skuId1:qty,skuId2:qty}` |
| K20 | `coupon:user:{userId}` | Set | 1h | CouponService.bindCache | CartCalc 取可用券 | `{userCouponId1,...}` |

### F. 配送/调度（4 项）

| K21 | `rider:loc:{riderId}` | Hash | 60s | DispatchService.uploadLoc | DispatchService.match | `{lng,lat,ts}` |
| K22 | `rider:online:{cityCode}` | GEO | — | RiderService.online/offline | DispatchService.GEORADIUS | `{member=riderId, lng, lat}` |
| K23 | `dispatch:queue:{cityCode}` | Stream | — | OrderService.afterPay → XADD | DispatchWorker XREADGROUP | `{orderNo, type, ...}` |
| K24 | `dispatch:retry:{orderNo}` | Integer | 5min | DispatchService.fail | DispatchService.scheduleRetry | `2` |

### G. 分布式锁（4 项）

| K25 | `lock:dispatch:{orderNo}` | String | 30s | Redlock acquire | Redlock release | `<random-token>` |
| K26 | `lock:stock:{skuId}` | String | 5s | OrderService.deduct | 同上 | `<random-token>` |
| K27 | `lock:order:create:{userId}` | String | 3s | OrderController.create | 同上 | `<random-token>` |
| K28 | `lock:job:{jobName}:{paramKey}` | String | 5min | JobService.cron | 同上（避免多副本重跑） | `<random-token>` |

### H. 限流/幂等（3 项）

| K29 | `rl:{path}:{userId}` | Integer | 60s | ThrottleGuard INCR + EXPIRE | 同上 | `12` |
| K30 | `rl:sms:freq:{mobileHash}` | Integer | 60s | SmsService.send | 同上 | `1` |
| K31 | `idem:{key}` | String | 10min | IdempotentInterceptor | 同上 | `<requestId>` |

### I. 排行榜/搜索（4 项）

| K32 | `rank:shop:{cityCode}` | ZSet | — | StatsJob.refreshDaily | HomeController.hotShops | `{member=shopId, score=monthlySales}` |
| K33 | `rank:product:{shopId}` | ZSet | — | StatsJob | ShopDetailPage.hotProducts | `{member=productId, score=sales}` |
| K34 | `search:hot:{cityCode}` | ZSet | — | SearchJob | SearchPage.hotKeywords | `{member="奶茶", score=1234}` |
| K35 | `search:history:{userId}` | List | 30d | SearchService.add | SearchHistory.list | `["奶茶","咖啡"]` |

### J. 内容/活动/积分（4 项）

| K36 | `cms:banner:{position}:{cityCode}` | String(JSON) | 5min | BannerService.list | HomeController | `[{id,title,imageUrl,...}]` |
| K37 | `coupon:remain:{couponId}` | Integer | 与有效期同 | CouponJob.init / receive 时 DECR | CouponService.canReceive | `100` |
| K38 | `redpkt:pool:{packetId}` | Hash | 与有效期同 | RedPacketService.init / 抢时 HSETNX | 同上 | `{r1:5.20, r2:3.14, ...}` |
| K39 | `signin:{userId}:{yyyymm}` | Bitmap | 35d | SigninService.signin SETBIT | SigninController.list BITCOUNT | bit per day of month |

### K. WebSocket / 推送（3 项）

| K40 | `ws:session:{connId}` | Hash | 2h | WsGateway.handleConnection | WsGateway.send | `{userId,terminal,connectAt}` |
| K41 | `ws:online:user:{userId}` | Set | — | WsGateway connect/disconnect | WsService.notify | `{connId1,connId2}` |
| K42 | `push:retry:{recordId}` | String | 1h | PushJob.fail | PushJob.scan | `<retryCount>` |

### L. 字典/配置/统计（额外 5 项，便于 P3 引用）

| K43 | `dict:{dictType}` | Hash | 30min（变更即 DEL） | DictService.list | 各业务 service | `{code:label, ...}` |
| K44 | `config:{group}:{key}` | String | 30min | ConfigService.get / 更新即 DEL | 业务 service | 配置值 |
| K45 | `region:tree` | String(JSON) | 12h | RegionService.tree | 用户端选择城市 | `[{code,name,children:[...]}]` |
| K46 | `region:open:cities` | Set | 1h | RegionService.openCities | 首页城市切换 | `{"110100","310100",...}` |
| K47 | `stat:order:{yyyymmdd}` | Hash | 2d | OrderService.afterFinish HINCRBY | DashboardController | `{takeout:123, errand:45}` |

---

## 三、TTL 速查与回收策略

| TTL        | 适用                        | 说明                                              |
| ---------- | --------------------------- | ------------------------------------------------- |
| 永久       | 库存/排行榜/在线集合/Stream | 必须有"过期清理 Job"或自然演化（如 Stream XTRIM） |
| 60s ~ 5min | 短期热点（轨迹/搜索结果）   | 写少读多场景                                      |
| 5 ~ 30min  | 业务画像缓存                | 配合 Cache-Aside + 延迟双删                       |
| 1 ~ 7d     | 订单状态/购物车/收藏        | 配合 DB 主存兜底                                  |
| 与有效期同 | 优惠券/红包池               | 业务自身有效期                                    |

---

## 四、Cache-Aside 写入策略（强制）

```
读：先 Redis；miss 读 DB；回写 Redis（含 TTL）
写：先写 DB；写后 DEL Redis；延迟 500ms 再 DEL（双删）
```

> 详见 CONSENSUS §四"Redis 与 MySQL 数据不一致 → Cache-Aside + 延迟双删"

---

## 五、监控与告警

P3/P9 阶段接入 Prometheus 指标：

- `redis_used_memory_bytes` ≥ 80% → 告警
- `redis_evicted_keys` 持续增长 → key TTL 设计有缺陷
- `redis_blocked_clients` ≥ 10 → 慢命令排查
- 业务 key 监控（用 `redis-cli --bigkeys` 周扫）

---

## 六、附：Lua 脚本约定（高一致性场景）

库存扣减、抢红包、抢券等强一致场景**必须用 Lua 脚本**保证原子性，避免应用层
GET-CHECK-SET 竞态。脚本统一存放在 `后端/src/redis/lua/*.lua`（P3 实现）。

```lua
-- 示例：stock_deduct.lua
-- KEYS[1]=stock:sku:{skuId} ; ARGV[1]=qty
local stock = tonumber(redis.call('GET', KEYS[1]))
if stock == nil then return -1 end
local qty = tonumber(ARGV[1])
if stock < qty then return 0 end
redis.call('DECRBY', KEYS[1], qty)
return 1
```

---

## 七、核对清单（ACCEPTANCE §四 验收）

- [x] 全量场景 ≥ 40 项（实 47 项）
- [x] 每项含 类型 / TTL / 命名模板 / 写入点 / 读取点 / 示例值
- [x] 命名规范明确（小写 + `:` 分隔 + 业务前缀）
- [x] 大 Value 拆分约定
- [x] 严禁 `KEYS *`，统一 SCAN
- [x] Cache-Aside + 延迟双删
- [x] Lua 脚本约定（高一致场景）
