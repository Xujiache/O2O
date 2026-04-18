# DESIGN_P2_数据库设计

> 本文件为 P2 阶段**详细设计**，产出 DDL 清单、索引策略、Redis Key 规划、TimescaleDB 方案。
> 完整 DDL 体量大，按领域列出主表+关键字段摘要，完整建表脚本在 `后端/src/database/migrations/` 落地。

---

## 一、整体数据架构

```
应用层 (NestJS)
   ├─► MySQL 8 主从（业务数据，InnoDB + utf8mb4）
   ├─► Redis 7 Cluster（缓存/锁/队列）
   ├─► RabbitMQ（订单异步/推送/分账）
   ├─► TimescaleDB（骑手定位轨迹）
   └─► MinIO / OSS（图片/凭证/发票/导出）
```

## 二、建表统一规范

- **主键**：`id BIGINT UNSIGNED`（雪花 ID），不使用 AUTO_INCREMENT
- **标配字段**：`tenant_id`、`is_deleted`、`created_at`、`updated_at`、`deleted_at`
- **金额**：`DECIMAL(12,2)`；坐标：`DECIMAL(10,7)`
- **状态**：`TINYINT UNSIGNED`，值域写入 `sys_dict`
- **敏感字段**：`*_enc`(AES-GCM 密文 VARBINARY) + `*_hash`(HMAC-SHA256 CHAR(64) 等值检索) + `*_tail4`(脱敏展示)
- **字符集**：`utf8mb4 / utf8mb4_0900_ai_ci`
- **外键**：逻辑外键，不建物理 FK
- **命名**：表名蛇形小写；索引 `idx_*` / `uk_*`

## 三、分领域表清单（约 100 张）

### D1 账号与认证（10 张）
- `user`、`user_address`
- `merchant`、`merchant_qualification`、`merchant_staff`
- `rider`、`rider_qualification`、`rider_deposit`
- `admin`、`role`、`permission`、`admin_role`、`role_permission`
- `blacklist`

### D2 地址与区域（2 张）
- `region`（行政区划）
- `delivery_area`（配送区域，GeoJSON 多边形）

### D3 店铺与商品（8 张）
- `shop`、`shop_business_hour`
- `product_category`、`product`、`product_sku`、`product_combo_item`
- `product_favorite`

### D4 订单（按月分表）
- `order_takeout_YYYYMM`、`order_takeout_item_YYYYMM`
- `order_errand_YYYYMM`（含 4 种服务类型）
- `order_status_log`（公用，按月分表）
- `order_proof`（取送件凭证）
- `order_after_sale`（售后工单）

### D5 支付与财务（9 张）
- `payment_record`、`refund_record`
- `account`、`account_flow`
- `settlement_rule`、`settlement_record`
- `withdraw_record`
- `invoice`、`reconciliation`

### D6 配送调度（7 张）
- `dispatch_record`、`transfer_record`、`abnormal_report`
- `rider_preference`、`delivery_track_summary`
- `rider_attendance`、`rider_reward`

### D7 营销（7 张）
- `coupon`、`user_coupon`、`promotion`、`red_packet`
- `user_point`、`user_point_flow`、`invite_relation`

### D8 评价与售后（5 张）
- `review`、`review_reply`、`review_appeal`
- `complaint`、`arbitration`、`ticket`

### D9 消息与通知（4 张）
- `message_template`、`message_inbox`、`push_record`、`notice`

### D10 系统与运营（8 张）
- `sys_dict`、`sys_config`
- `operation_log`、`api_log`
- `banner`、`hot_search`、`file_meta`

## 四、核心表关键字段摘要

### user
- 主键 + `union_id`/`open_id_mp`（小程序）
- `mobile_enc` / `mobile_hash` / `mobile_tail4`
- `id_card_enc` / `id_card_hash` / `is_realname`
- `status`（0 封禁 / 1 正常）、`reg_source`
- 索引：`uk_union_id` / `uk_open_id_mp` / `uk_mobile_hash` / `idx_status_tenant`

### order_takeout_YYYYMM（外卖订单月分表，最核心）
- `id` / `order_no`(CHAR18 业务号)
- `user_id` / `shop_id` / `merchant_id` / `rider_id`
- 金额：`goods_amount` / `delivery_fee` / `package_fee` / `discount_amount` / `coupon_amount` / `pay_amount`
- 地址快照：`address_snapshot JSON`
- 状态机 `status`：0 待支付 / 10 待接单 / 20 已接单待出餐 / 30 出餐待取 / 40 配送中 / 50 已完成 / 60 已取消 / 70 售后中
- `pay_status` / `pay_method` / `pay_at`
- 时间轴：`accept_at` / `ready_at` / `dispatch_at` / `picked_at` / `delivered_at` / `finished_at` / `cancel_at`
- 索引：`uk_order_no` / `idx_user_status` / `idx_shop_status` / `idx_rider_status` / `idx_status_created`

### order_errand_YYYYMM（跑腿订单月分表）
- `service_type`（1 帮送 / 2 帮取 / 3 帮买 / 4 帮排队）
- `pickup_snapshot` / `delivery_snapshot`（JSON）
- `item_type` / `item_weight` / `item_value`（保价）
- `buy_list`(JSON 帮买清单) / `buy_budget`
- `queue_place` / `queue_type` / `queue_duration_min`
- `pickup_code CHAR(6)` 取件码
- `service_fee` / `tip_fee` / `insurance_fee` / `estimated_goods` / `pay_amount`
- 状态机 `status`：0 待支付 / 10 待接单 / 20 已接单 / 30 已取件 / 40 配送中 / 50 已完成 / 60 已取消 / 70 售后中

### payment_record
- `pay_no`(28) + `out_trade_no`(第三方)
- `order_no` / `order_type` / `user_id` / `amount`
- `pay_method`（1 微信 / 2 支付宝 / 3 余额 / 4 混合）
- `status` / `raw_response JSON` / `paid_at`
- 索引：`uk_pay_no` / `uk_out_trade` / `idx_order` / `idx_user_status`

### settlement_rule / settlement_record
- 规则：`scene`(1外卖/2跑腿) + `target_type`(1商户/2骑手/3平台) + `scope_type`(1全局/2城市/3单店) + `rate`
- 记录：每单 1~3 条（商户/骑手/平台）

### rider_location_ts（TimescaleDB）
- `time TIMESTAMPTZ` + `rider_id` + `order_no` + `lng/lat` + `speed/direction/accuracy`
- hypertable chunk 7 天、压缩 7 天后、保留 180 天

## 五、索引策略原则

1. 主键簇索引自动建立
2. 每个唯一业务键建 `uk_*`
3. 高频查询字段建组合索引，字段顺序按**选择性降序**
4. 订单表：`(user_id,status,created_at)` / `(shop_id,status,created_at)` / `(rider_id,status,created_at)` / `(status,created_at)`
5. 列表页分页：始终以 `created_at` 为 ORDER BY 列，避免大 OFFSET（用 keyset 分页）
6. 避免在加密列上建索引；通过 `_hash` 列实现等值查询

## 六、分表策略

| 表 | 策略 | 保留 | 归档 |
|---|---|---|---|
| `order_takeout_*` | 按月（`YYYYMM` 后缀） | 24 月 | OSS + 数据湖 |
| `order_errand_*` | 按月 | 24 月 | OSS + 数据湖 |
| `order_takeout_item_*` | 按月，随订单 | 24 月 | 同上 |
| `order_status_log_*` | 按月 | 12 月 | 冷存储 |
| `payment_record_*` | 按月 | 24 月 | OSS |
| `api_log_*` | 按周 | 3 月 | 冷存储 |
| `operation_log_*` | 按月 | 12 月 | 冷存储 |

应用层封装 `ShardingRouter`：根据 `created_at` 或 `order_no` 中的日期段路由到物理表。

## 七、Redis Key 规划（40+ 场景）

| 场景 | Key | 类型 | TTL |
|---|---|---|---|
| Token | `auth:token:{userType}:{userId}` | String | JWT_EXPIRES_IN |
| 短信验证码 | `auth:sms:{mobileHash}` | String | 5min |
| 登录失败次数 | `auth:loginfail:{mobileHash}` | Integer | 30min |
| 用户信息 | `user:info:{userId}` | Hash | 30min |
| 店铺详情 | `shop:detail:{shopId}` | Hash | 10min |
| 店铺列表 | `shop:list:{cityCode}:{page}` | String | 2min |
| 商品详情 | `product:detail:{productId}` | Hash | 10min |
| 库存 | `stock:sku:{skuId}` | Integer | 永久 |
| 订单状态 | `order:status:{orderNo}` | Hash | 7d |
| 支付超时 | `order:paytimeout:{orderNo}` | String(ZSet) | 15min |
| 购物车 | `cart:{userId}:{shopId}` | Hash | 7d |
| 骑手位置 | `rider:loc:{riderId}` | GEO/Hash | 60s |
| 在线骑手 | `rider:online:{cityCode}` | GEO/Set | — |
| 派单队列 | `dispatch:queue:{cityCode}` | List/Stream | — |
| 派单锁 | `lock:dispatch:{orderNo}` | String | 30s |
| 库存扣减锁 | `lock:stock:{skuId}` | String | 5s |
| 订单创建锁 | `lock:order:create:{userId}` | String | 3s |
| 限流 | `rl:{path}:{userId}` | Integer | 60s |
| 接口幂等 | `idem:{key}` | String | 10min |
| 热门商家 | `rank:shop:{cityCode}` | ZSet | — |
| 热门商品 | `rank:product:{shopId}` | ZSet | — |
| 热搜词 | `search:hot:{cityCode}` | ZSet | — |
| 首页运营位 | `cms:banner:{cityCode}` | String | 5min |
| 活动发放 | `coupon:remain:{couponId}` | Integer | 与有效期同 |
| 红包 | `redpkt:pool:{id}` | Hash | 与有效期同 |
| 短信频控 | `sms:freq:{mobileHash}` | Integer | 60s |
| 推送重试 | `push:retry:{id}` | String | 1h |
| 签到 | `signin:{userId}:{yyyymm}` | Bitmap | 35d |
| WS 会话 | `ws:session:{connId}` | Hash | 2h |
| 在线用户 | `ws:online:user:{userId}` | Set | — |
| 统计当日订单 | `stat:order:{yyyymmdd}` | Hash | 2d |

## 八、TimescaleDB 骑手轨迹

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE TABLE rider_location_ts (
  time       TIMESTAMPTZ NOT NULL,
  rider_id   BIGINT      NOT NULL,
  order_no   CHAR(18),
  lng        DOUBLE PRECISION NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  speed_kmh  REAL,
  direction  SMALLINT,
  accuracy_m REAL,
  battery    SMALLINT,
  tenant_id  INT NOT NULL DEFAULT 1
);
SELECT create_hypertable('rider_location_ts','time',chunk_time_interval=>INTERVAL '7 days');
CREATE INDEX ON rider_location_ts (rider_id,time DESC);
CREATE INDEX ON rider_location_ts (order_no,time DESC);
ALTER TABLE rider_location_ts SET (timescaledb.compress,timescaledb.compress_segmentby='rider_id');
SELECT add_compression_policy('rider_location_ts', INTERVAL '7 days');
SELECT add_retention_policy('rider_location_ts',  INTERVAL '180 days');
```

## 九、敏感字段加密清单

| 表 | 明文字段 | 加密列 | 检索列 | 展示列 |
|---|---|---|---|---|
| user | mobile | mobile_enc | mobile_hash | mobile_tail4 |
| user | id_card | id_card_enc | id_card_hash | — |
| user | real_name | real_name_enc | — | — |
| merchant | mobile | mobile_enc | mobile_hash | mobile_tail4 |
| merchant | legal_id_card | legal_id_card_enc | legal_id_card_hash | — |
| rider | name / mobile / id_card | *_enc | mobile_hash / id_card_hash | mobile_tail4 |
| withdraw_record | bank_card_no / account_holder | *_enc | — | bank_card_tail4 |

算法：AES-256-GCM，key 放 KMS（本地用环境变量 `ENC_KEY_V1`），支持多版本 key 轮换列 `enc_key_ver`。

## 十、数据安全与备份

- **传输**：全链路 TLS
- **存储**：敏感字段 AES-GCM；MySQL 用户/权限最小化；RDS 默认开启透明加密
- **备份**：binlog 开启 row；每日 00:30 全量（xtrabackup）；每小时增量；跨区域复制
- **恢复**：定期演练，RPO ≤ 1h，RTO ≤ 30min
- **脱敏**：日志打印前 mask；管理后台展示 tail4；导出 CSV 使用权限二次审批

## 十一、初始化 seed 数据

- `sys_dict`：订单状态、支付方式、违规类型、行业分类、骑手等级、售后原因、取消原因
- `region`：省市区三级（从国家统计局官方数据导入）
- `role`：超级管理员、运营、财务、客服、风控
- `permission`：按菜单/按钮/接口三层生成
- `admin`：默认 `Super`（对齐管理后台 README）

---

## 十二、设计产物

- [ ] `后端/src/database/migrations/` 全量 DDL
- [ ] `后端/src/database/seeds/` 初始化数据
- [ ] `后端/src/database/timescale/` TimescaleDB 脚本
- [ ] `后端/src/database/redis-keys.md` Key 规范
- [ ] `后端/src/database/erd/*.md` 分领域 ER 图（Mermaid）
