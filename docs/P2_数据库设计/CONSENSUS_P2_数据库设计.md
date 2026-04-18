# CONSENSUS_P2_数据库设计

> 本文件为 P2 阶段**方案共识**，锁定库表范围、设计原则、交付标准、风险。

---

## 一、需求范围共识

### 1.1 领域划分（10 大领域）

| 领域 | 表数量（预估） | 说明 |
|---|---|---|
| D1 账号与认证 | 约 10 | 用户/商户/骑手/管理员，资质、保证金、黑名单 |
| D2 地址与区域 | 约 5 | 用户地址、门店地址、行政区划、配送区域 |
| D3 店铺与商品 | 约 12 | 店铺、分类、商品、SKU、套餐、库存、标签、评价统计 |
| D4 订单 | 约 15 | 外卖订单、跑腿订单、明细、状态日志、取件码、售后 |
| D5 支付与财务 | 约 12 | 支付、退款、账户、流水、分账规则、分账记录、提现、发票、对账 |
| D6 配送调度 | 约 8 | 派单记录、转单记录、配送轨迹、取送凭证、异常上报、接单偏好 |
| D7 营销 | 约 10 | 优惠券、用户券、红包、满减/折扣、拼单、邀请、积分、签到 |
| D8 评价与售后 | 约 6 | 评价、回复、投诉、仲裁、工单、申诉 |
| D9 消息与通知 | 约 6 | 消息模板、消息中心、订阅关系、推送记录、站内信、公告 |
| D10 系统与运营 | 约 16 | 管理员、角色、权限、字典、配置、banner、操作日志、接口日志、异常日志、运营位、快捷入口、首页推荐、热搜词 |

**合计 ~100 张主表**（最终数量以 DESIGN 为准）。

### 1.2 非 MySQL 数据

- **Redis**：约 40 类 Key（详见 DESIGN §6）
- **TimescaleDB**：`rider_location_ts`（骑手轨迹时序超表）
- **MinIO**：图片/凭证/发票 PDF/导出文件（MySQL 仅存 URL+元数据）

---

## 二、技术方案共识（锁定）

### 2.1 设计原则

1. **规范优先**：所有表遵循统一命名、字段、索引规范（DESIGN §2.1）
2. **读写分离预留**：主键全局雪花 ID，不依赖 `AUTO_INCREMENT`
3. **软删**：统一 `is_deleted tinyint(1) NOT NULL DEFAULT 0` + `deleted_at DATETIME(3) NULL`
4. **多租户预留**：所有业务表带 `tenant_id`（默认 `1`），未来平台化可拆
5. **时间三元组**：`created_at` / `updated_at` / `deleted_at`，`DATETIME(3)` 毫秒精度
6. **金额**：一律 `DECIMAL(12, 2)`，禁止 `FLOAT/DOUBLE`
7. **状态**：一律 `TINYINT`，值域写入字典表 `sys_dict`
8. **外键**：**逻辑外键**（不建物理 FK），保证分库扩展性
9. **索引**：主键簇、唯一键、查询常用字段三类建齐，避免重复索引
10. **敏感字段**：AES-GCM 加密列 + `_hash` 列（HMAC 用于等值查询）+ `_tail4` 列（脱敏展示）
11. **分表**：`order_takeout_YYYYMM`、`order_errand_YYYYMM`、`rider_location_YYYYMM`，主库 24 个月
12. **归档**：超出保留期归档到 OSS + 数据湖

### 2.2 ID 与订单号策略

- 内部主键：雪花 ID（64bit：时间戳 + 机器位 + 序列号），`BIGINT UNSIGNED`
- 业务订单号：`[类型前缀1位][日期8位][分片2位][序列6位][校验1位]` 共 18 位字符串
  - 类型前缀：`T`=外卖 takeout，`E`=跑腿 errand
  - 便于人眼识别、客服沟通、日志定位

### 2.3 分表策略

| 表 | 分表键 | 周期 | 保留 | 归档 |
|---|---|---|---|---|
| 外卖订单 | 创建时间 | 月 | 24 个月 | OSS Parquet |
| 跑腿订单 | 创建时间 | 月 | 24 个月 | OSS Parquet |
| 支付流水 | 创建时间 | 月 | 24 个月 | OSS Parquet |
| 骑手轨迹 | 骑手+时间 | 周（TimescaleDB hypertable chunk） | 6 个月 | 冷存储 |
| 操作日志 | 创建时间 | 月 | 12 个月 | 冷存储 |
| 接口日志 | 创建时间 | 周 | 3 个月 | 冷存储 |

### 2.4 缓存策略（Redis）

- 会话/Token：`auth:token:{userId}`（TTL=JWT_EXPIRES_IN）
- 用户信息：`user:info:{userId}`（TTL=30min，更新时删除）
- 店铺详情：`shop:detail:{shopId}`（TTL=10min）
- 商品库存：`stock:sku:{skuId}`（永久，更新即写）
- 订单状态：`order:status:{orderNo}`（TTL=7d）
- 骑手位置：`rider:location:{riderId}`（TTL=60s，15s 刷新）
- 派单队列：`dispatch:queue:{cityCode}`（List）
- 限流：`ratelimit:{path}:{userId}`（TTL=60s）
- 分布式锁：`lock:order:{orderNo}`（Redlock）
- 热点排行：`rank:shop:{cityCode}`（ZSet）

### 2.5 加密字段清单

| 表 | 字段 | 加密 | Hash 检索 | 脱敏展示 |
|---|---|---|---|---|
| user | mobile | AES-GCM | mobile_hash | 138****0000 |
| user | id_card | AES-GCM | id_card_hash | 110***********1234 |
| user | real_name | AES-GCM | - | 张* |
| merchant | legal_id_card | AES-GCM | - | 110***********1234 |
| rider | id_card | AES-GCM | id_card_hash | 同上 |
| rider | bank_card | AES-GCM | - | ****1234 |
| withdraw_record | bank_card_no | AES-GCM | - | ****1234 |
| address | detail | 不加密但脱敏日志 | - | - |

---

## 三、交付标准共识

### 3.1 交付物

- [ ] `docs/P2_数据库设计/DESIGN_P2_数据库设计.md` 全量 DDL 设计
- [ ] ER 图：按 10 领域分图（markdown + PlantUML / mermaid）
- [ ] `后端/src/database/migrations/*.sql`：可直接执行的 MySQL 建表 & 索引脚本
- [ ] `后端/src/database/seeds/*.sql`：初始化字典、角色、权限、行政区划
- [ ] `后端/src/database/timescale/*.sql`：TimescaleDB hypertable 创建
- [ ] `后端/src/database/redis-keys.md`：Redis Key 命名规范
- [ ] 数据备份与恢复 Runbook（≥ 99.9% 可用性）

### 3.2 质量标准

- 每张表含表注释、字段注释、索引说明
- 每个索引有明确的查询场景说明
- 每个枚举状态在 `sys_dict` 有对应字典
- DDL 可直接在 MySQL 8.0 执行无错
- ER 图与 DDL 100% 一致

---

## 四、风险与应对

| 风险 | 应对 |
|---|---|
| 分表跨月查询复杂 | 应用层封装 ShardingRouter；报表走数据仓库 |
| 雪花 ID 机器位冲突 | 启动时从 Redis 原子获取 workerId，重启回收 |
| 敏感字段加密影响模糊查询 | 仅允许精确查询（通过 hash 列），不支持模糊 |
| TimescaleDB 学习成本 | 仅骑手轨迹使用，接口封装，业务无感 |
| Redis 与 MySQL 数据不一致 | 更新采用 Cache-Aside + 延迟双删 |
| 订单并发超卖 | Redis 原子扣减 + 数据库行级锁兜底 |

---

## 五、共识结论

- 10 领域 ~100 表范围锁定
- 雪花 ID + 18 位订单号
- 月级分表 + 24 个月热数据
- Redis 40+ Key 场景覆盖
- TimescaleDB 承载骑手轨迹
- 敏感字段 AES-GCM + Hash 索引 + 脱敏展示
- 进入 DESIGN 阶段输出全量 DDL
