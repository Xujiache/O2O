# ACCEPTANCE_P2_数据库设计

> 本文件为 P2 阶段**验收标准**。

## 一、DDL 可执行性

| 项 | 方法 | 通过标准 |
|---|---|---|
| V2.1 | 在 docker MySQL 8.0 空库执行 01~10 DDL | 全部成功，无语法错误 |
| V2.2 | 执行 `SHOW CREATE TABLE` | 字符集 `utf8mb4`，ENGINE=InnoDB |
| V2.3 | 抽检 10 张表注释 | 表注释+字段注释完整 |
| V2.4 | 执行 seeds 01~04 | 成功，count 符合预期 |
| V2.5 | 执行 TimescaleDB 脚本 | hypertable 建立、压缩/保留策略生效 |

## 二、结构规范

| 项 | 通过标准 |
|---|---|
| 主键 | 每张表主键为 `id BIGINT UNSIGNED` |
| 标配字段 | `tenant_id / is_deleted / created_at / updated_at / deleted_at` 齐全 |
| 金额 | 无 FLOAT/DOUBLE，一律 DECIMAL |
| 敏感字段 | 都有 `_enc / _hash / _tail4` 三列（或至少 `_enc + _tail4`） |
| 状态 | 无 VARCHAR 状态，统一 TINYINT |
| 索引 | 每张表至少 1 个业务索引；高频查询有组合索引 |
| 命名 | 蛇形小写、表前缀清晰、索引 `idx_*`/`uk_*` |

## 三、覆盖度

| 项 | 通过标准 |
|---|---|
| PRD 实体覆盖 | PRD §3 全部实体在表清单中出现 |
| 订单状态 | 10 种外卖状态 + 10 种跑腿状态均在枚举注释中出现 |
| 字典 | sys_dict 含订单状态、支付方式、违规类型、行业、等级、售后原因 |
| RBAC | 5 个默认角色，按菜单/按钮/接口三层权限录入 |

## 四、性能与容量

| 项 | 通过标准 |
|---|---|
| 订单分表 | 月分表生效，`order_takeout_202604` 等物理表真实存在 |
| 自动建表 Job | 可手动触发生成下月物理表 |
| 预估 | 单月订单 ≤ 1000 万条时，单表 5000 万以内无压力 |
| Redis Key 规范 | 40+ 场景全部记入 `redis-keys.md` |
| TimescaleDB | chunk 7 天、压缩 7 天后、保留 180 天 |

## 五、安全

| 项 | 通过标准 |
|---|---|
| 敏感字段加密 | 手机号/身份证/银行卡全部走 `_enc`，不留明文字段 |
| 等值检索 | 使用 `_hash` 列（HMAC-SHA256） |
| key 轮换 | `enc_key_ver` 字段保留 |
| 备份 Runbook | 含 RPO/RTO、恢复步骤、演练周期 |

## 六、交付物

- [ ] `后端/src/database/migrations/01..10_*.sql`
- [ ] `后端/src/database/seeds/01..04_*.sql`
- [ ] `后端/src/database/timescale/01_schema.sql`
- [ ] `后端/src/database/erd/D1..D10_*.md`（Mermaid）
- [ ] `后端/src/database/redis-keys.md`
- [ ] `后端/src/database/README.md`（使用说明）
- [ ] 备份与恢复 Runbook（位于 `部署/runbooks/db-backup.md`）

## 七、验收签字

| 角色 | 签字 |
|---|---|
| 架构 | |
| DBA | |
| 后端 | |
| PM | |
