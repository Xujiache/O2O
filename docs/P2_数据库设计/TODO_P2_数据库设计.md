# TODO_P2_数据库设计

> 与 `TASK_P2_数据库设计.md` 一一对应，完成一项即勾选并补充结果。

## 一、进行中
- [ ] —

## 二、待办
（无）

## 三、已完成（按时间顺序）

### M2.1 基础 DDL（P0 核心）

- [x] **T2.1 建库与权限** — 2026-04-19 / 产出 `后端/src/database/migrations/00_init.sql`；含 utf8mb4 默认字符集、`o2o_app` + `o2o_readonly` 最小权限；密码 `<CHANGE_ME>` 占位
- [x] **T2.2 D1 账号与认证 DDL** — 2026-04-19 / 产出 `01_account.sql`；14 张表（user/user_address/merchant/merchant_qualification/merchant_staff/rider/rider_qualification/rider_deposit/admin/role/permission/admin_role/role_permission/blacklist）；敏感字段 _enc/_hash/_tail4 三列模式落地
- [x] **T2.4 D3 店铺与商品 DDL** — 2026-04-19 / 产出 `03_shop_product.sql`；7 张表；shop(city_code,status) + product(shop_id,status,sort) 重点索引齐全
- [x] **T2.5 D4 订单分表模板 + 月份自动建表** — 2026-04-19 / 产出 `04_order.sql`；3 模板表 + order_status_log_template + order_proof + order_after_sale；存储过程 `sp_create_order_monthly_tables` 落地；末尾 CALL 生成 202604 + 202605 共 8 张物理分表
- [x] **T2.6 D5 支付与财务 DDL** — 2026-04-19 / 产出 `05_finance.sql`；9 张表（payment_record/refund_record/account/account_flow/settlement_rule/settlement_record/withdraw_record/invoice/reconciliation）；direction TINYINT 1 入 / 2 出；account_flow 复合索引 (account_id, created_at)

### M2.2 其他领域 DDL（P1）

- [x] **T2.3 D2 地址与区域 DDL + region seed 占位** — 2026-04-19 / 产出 `02_region.sql`（2 张表：region/delivery_area；GeoJSON 用 JSON 列）；T2.22 复检后补 region.tenant_id 满足验收标配
- [x] **T2.7 D6 配送调度 DDL** — 2026-04-19 / 产出 `06_dispatch.sql`；7 张表
- [x] **T2.8 D7 营销 DDL** — 2026-04-19 / 产出 `07_marketing.sql`；7 张表
- [x] **T2.9 D8 评价售后 DDL** — 2026-04-19 / 产出 `08_review.sql`；6 张表（含 ticket，决策记录见 README §4.1）
- [x] **T2.10 D9 消息通知 DDL** — 2026-04-19 / 产出 `09_message.sql`；4 张表
- [x] **T2.11 D10 系统运营 DDL** — 2026-04-19 / 产出 `10_system.sql`；8 张表（在 DESIGN 列出 7 张基础上补 home_recommend；决策见 README §4.2）

### M2.3 Seed / 扩展（P1~P2）

- [x] **T2.12 sys_dict seed** — 2026-04-19 / 产出 `seeds/01_dict.sql`；16 个 dict_type ~108 项（外卖10/跑腿10/支付方式/支付状态/违规/行业12/骑手等级5/售后9/取消8/转单5/异常7/投诉8/工单7/奖励9/服务4/物品7）
- [x] **T2.13 region seed** — 2026-04-19 / 产出 `seeds/02_region.sql`；首版 ~150 行（全 34 省级 + 4 直辖市完整 + 一线 + 部分省会），完整 4000+ 行 LOAD DATA 方案在文件头说明
- [x] **T2.14 role / permission seed** — 2026-04-19 / 产出 `seeds/03_rbac.sql`；5 角色 / 92 permission（菜单 48[顶级 10 + 二级 38] + 按钮 28 + 接口 16）/ ~120 关联
- [x] **T2.15 admin 超管种子账号** — 2026-04-19 / 产出 `seeds/04_admin.sql`；默认 Super 账号 + bcrypt 不可登录占位 hash + 激活流程注释
- [x] **T2.16 月分表自动维护 Job** — 2026-04-19 / 产出 `jobs/monthly-table-job.md`；方案 A (MySQL Event) vs 方案 B (NestJS Cron) 对比 + 选定 B + Nest 占位代码（P3 落地）
- [x] **T2.17 TimescaleDB hypertable** — 2026-04-19 / 产出 `timescale/01_schema.sql`（hypertable + 2 索引 + 压缩策略 + 保留策略） + `部署/docker-compose.dev.yml` 追加 `timescaledb` 服务条目（image=timescale/timescaledb:2.16.1-pg16 / 5432 端口 / env 注入密码 / docker-entrypoint-initdb.d 自动执行）
- [x] **T2.18 Redis Key 规范文档** — 2026-04-19 / 产出 `redis-keys.md`；47 项场景表 + 命名规范 + Cache-Aside 双删 + Lua 脚本约定
- [x] **T2.19 ER 图** — 2026-04-19 / 产出 `erd/D1..D10_*.md` 共 10 份；每份用 Mermaid `erDiagram` 语法，含主表关系
- [x] **T2.20 加密字段方案** — 2026-04-19 / 产出 `encryption.md`；AES-256-GCM + IV 12B + KMS 密钥层级 + enc_key_ver 轮换 + HMAC-SHA256 检索 + tail4 脱敏 + 全字段清单
- [x] **T2.21 备份与恢复 Runbook** — 2026-04-19 / 产出 `部署/runbooks/db-backup.md`；binlog ROW + xtrabackup 全量 + 每小时增量 + OSS 异地复制 + RPO≤1h/RTO≤30min + PITR + TimescaleDB/Redis 备份 + K8s CronJob 模板 + 监控告警

### M2.4 收尾

- [x] **T2.22 DDL 全量执行验证** — 2026-04-19 / 本机无 docker CLI + 本机 MySQL 80 root 密码未知（不冒险破坏用户已有库），按提示词降级处置：执行了 (a) SQL 文件 token 一致性扫描（70/70 表 InnoDB+utf8mb4+collate_ai_ci 全通过）/ (b) 五标配字段齐全度扫描（10/10 文件 70/70 表 [OK]）/ (c) 敏感字段三列模式扫描 / (d) docker-compose.dev.yml YAML 解析（5 services + timescaledb 配置完整）；运行态实库执行**归并到 P9 集成测试部署**阶段
- [x] **T2.23 更新说明文档进度** — 2026-04-19 / 更新 `说明文档.md` §3.1（P2 → 🟡 进行中，"待 Cascade P2-REVIEW"）+ §3.3 追加 P2 完成日志；产出 `docs/P2_数据库设计/P2_COMPLETION_REPORT.md`；本 TODO 全部勾选

## 四、阻塞
| 任务 | 原因 | 责任人 | 预计解除 |
|---|---|---|---|
| - | 无 | - | - |

## 五、变更记录
| 日期 | 变更内容 | 变更人 |
|---|---|---|
| 2026-04-18 | 初建，依据 TASK_P2 拆解 | 架构组 |
| 2026-04-19 | T2.1~T2.23 全 23 项完成 + 本 TODO 勾选 + 完成报告 | 执行 Agent |
| 2026-04-19 | P2-REVIEW-01 第 1 轮修复完成（I-01~I-04 共 4 项 P1） | 员工 A（修复轮次 R1） |
