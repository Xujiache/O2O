# 后端数据层 README

> 阶段：P2 数据库设计 / T2.22 收尾产出
> 用途：数据库脚本目录使用说明（执行顺序、前置条件、常见问题）
> 维护范围：`后端/src/database/` 目录全部资产

---

## 一、目录结构

```
后端/src/database/
├── README.md                       # 本文件
├── encryption.md                   # 敏感字段加密方案（P2 / T2.20）
├── redis-keys.md                   # Redis Key 命名与场景规范（P2 / T2.18）
├── migrations/                     # MySQL 8 主库 DDL（P2 / T2.1~T2.11）
│   ├── 00_init.sql                 # 建库 + 权限（root 执行）
│   ├── 01_account.sql              # D1 账号与认证（14 张表）
│   ├── 02_region.sql               # D2 地址与区域（2 张表）
│   ├── 03_shop_product.sql         # D3 店铺与商品（7 张表）
│   ├── 04_order.sql                # D4 订单（4 模板表 + 2 全局表 + 存储过程 + 8 物理分表）
│   ├── 05_finance.sql              # D5 支付与财务（9 张表）
│   ├── 06_dispatch.sql             # D6 配送调度（7 张表）
│   ├── 07_marketing.sql            # D7 营销（7 张表）
│   ├── 08_review.sql               # D8 评价售后（6 张表）
│   ├── 09_message.sql              # D9 消息通知（4 张表）
│   └── 10_system.sql               # D10 系统运营（8 张表）
├── seeds/                          # 初始化数据（P2 / T2.12~T2.15）
│   ├── 01_dict.sql                 # 字典数据（16 dict_type / ~108 项）
│   ├── 02_region.sql               # 行政区划（首版 ~150 行；完整 4000+ 见文件头方案）
│   ├── 03_rbac.sql                 # 角色 + 权限点（5 角色 / 92 permission / ~120 关联）
│   └── 04_admin.sql                # 默认 Super 超管账号（占位 hash 必须重置）
├── timescale/                      # TimescaleDB 时序库（PostgreSQL，独立实例）
│   └── 01_schema.sql               # rider_location_ts 超表
├── jobs/                           # 调度任务设计（P2 文档 / P3 编码）
│   └── monthly-table-job.md        # 月分表自动维护 Job（NestJS Cron 主 + MySQL Event 兜底）
└── erd/                            # 分领域 ER 图（10 份 Mermaid）
    ├── D1_account.md
    ├── D2_region.md
    ├── D3_shop_product.md
    ├── D4_order.md
    ├── D5_finance.md
    ├── D6_dispatch.md
    ├── D7_marketing.md
    ├── D8_review.md
    ├── D9_message.md
    └── D10_system.md
```

---

## 二、执行顺序（首次初始化）

### 2.1 启动依赖容器

```bash
# 在仓库根目录执行
pnpm docker:dev:up

# 等待健康检查通过（通常 30~60 秒）
docker compose -f 部署/docker-compose.dev.yml ps
# 期望看到 mysql / redis / rabbitmq / minio / timescaledb 全部 healthy
```

### 2.2 MySQL 主库初始化

```bash
# 1) 建库 + 应用账号（root 执行）
docker exec -i o2o-mysql mysql -uroot -po2o_root_2026 \
  < 后端/src/database/migrations/00_init.sql

# 2) 业务表 DDL（按 01~10 顺序）
for f in 01_account 02_region 03_shop_product 04_order \
         05_finance 06_dispatch 07_marketing 08_review \
         09_message 10_system; do
  echo "==> applying migrations/${f}.sql"
  docker exec -i o2o-mysql mysql -uroot -po2o_root_2026 o2o_platform \
    < 后端/src/database/migrations/${f}.sql
done

# 3) Seed 数据（按 01~04 顺序）
for f in 01_dict 02_region 03_rbac 04_admin; do
  echo "==> applying seeds/${f}.sql"
  docker exec -i o2o-mysql mysql -uroot -po2o_root_2026 o2o_platform \
    < 后端/src/database/seeds/${f}.sql
done
```

### 2.3 TimescaleDB 初始化

```bash
docker exec -i o2o-timescaledb psql -U o2o_ts -d o2o_timescale \
  < 后端/src/database/timescale/01_schema.sql
```

> 注：`部署/docker-compose.dev.yml` 已将 `timescale/` 目录挂为
> `/docker-entrypoint-initdb.d:ro`；**首次启动 timescaledb 容器时**会自动执行
> 该目录所有 `*.sql`，因此**通常无需手动执行**。仅在已有数据卷重建/补刷时手动执行。

### 2.4 Redis 初始化

无需 SQL；Redis 自身随容器启动，按 `redis-keys.md` 规范由各业务 Service 写入。

---

## 三、PowerShell 版本（Windows 开发机）

```powershell
# MySQL DDL
$pwd = 'o2o_root_2026'
& docker exec -i o2o-mysql mysql -uroot "-p$pwd" `
  --default-character-set=utf8mb4 `
  < .\后端\src\database\migrations\00_init.sql

foreach ($f in '01_account','02_region','03_shop_product','04_order','05_finance','06_dispatch','07_marketing','08_review','09_message','10_system') {
  Write-Host "==> applying migrations/$f.sql"
  Get-Content -Raw -Encoding UTF8 ".\后端\src\database\migrations\$f.sql" | `
    docker exec -i o2o-mysql mysql -uroot "-p$pwd" o2o_platform --default-character-set=utf8mb4
}

# Seeds
foreach ($f in '01_dict','02_region','03_rbac','04_admin') {
  Write-Host "==> applying seeds/$f.sql"
  Get-Content -Raw -Encoding UTF8 ".\后端\src\database\seeds\$f.sql" | `
    docker exec -i o2o-mysql mysql -uroot "-p$pwd" o2o_platform --default-character-set=utf8mb4
}
```

---

## 四、设计决策记录

### 4.1 D8 表数量歧义（5 vs 6）

- DESIGN §三 D8 标题写"5 张"，但实际列出 6 项（review/review_reply/review_appeal/complaint/arbitration/ticket）
- CONSENSUS §1.1 D8 预估 6 张
- **本期决策**：以 DESIGN §三 列出的 6 张表为准。`ticket` 保留在 D8 而非并入 D10，因为 ticket 与 complaint/arbitration 同属客服/投诉/工单语义族，并入 D10 会与系统配置混淆
- 落地：`08_review.sql` 共 6 张表

### 4.2 D10 表数量歧义（DESIGN 标题 8 张 vs 列表 7 张）

- DESIGN §三 D10 标题写"8 张"，但实际列出 7 项（sys_dict/sys_config/operation_log/api_log/banner/hot_search/file_meta）
- **本期决策**：补 `home_recommend` 第 8 张（首页推荐位/快捷入口），覆盖 PRD §3.4.6.2 运营位/快捷入口 + §3.1.1.4 推荐模块业务需求
- 落地：`10_system.sql` 共 8 张表

### 4.3 region 表加 tenant_id

- 行政区划本身平台级共享（PRD 无租户隔离要求）
- 但 ACCEPTANCE §二 验收要求"标配字段齐全"
- **决策**：仍补加 `tenant_id INT UNSIGNED DEFAULT 1`，列注释明确"行政区划平台级共享，固定 1；为对齐标配五字段保留列"

### 4.4 雪花 ID workerId 分配（占位约定）

- 字段类型已就位（`id BIGINT UNSIGNED`）
- workerId 分配策略：P3 实现时从 Redis 原子获取（`workerId:lease:{appName}` 自增至 0~1023 范围循环），重启回收
- 本阶段 seed 使用直写整数 ID（如 1001、3001）便于 ER 图引用，**不与运行时雪花 ID 冲突**（雪花 ID 在 timestamp 段差异巨大）

### 4.5 sys_dict 不带 tenant_id 校验

- 字典属于平台级数据，无需租户隔离
- 当前 10_system.sql 中 sys_dict 表已带 tenant_id 列（默认 1），完全对齐设计原则

---

## 五、模糊查询限制（重要）

由于敏感字段加密存储（详见 `encryption.md`），**MySQL 不支持对 `*_enc` 列做模糊查询**。

如业务/前端/BI 需要"按手机号前缀搜索"等场景：

- **方案 A**（推荐）：用 `*_tail4` 列做末 4 位精确匹配
- **方案 B**：BI 离线作业先全量解密到数仓再分析（需安全审批）
- **方案 C**（不允许）：解除加密 → 违反 PRD §4.3.1，禁止

---

## 六、Redis 与 MySQL 一致性

DESIGN / CONSENSUS 已锁定：**Cache-Aside + 延迟双删**。

```
读：先 Redis → miss → 读 DB → 回写 Redis（含 TTL）
写：先写 DB → DEL Redis → 延迟 500ms 再 DEL（双删避免脏读）
```

具体实现见 P3 阶段 `后端/src/common/cache/cache-aside.service.ts`。

---

## 七、常见问题

### Q1：执行 04_order.sql 报 `ERROR 1305 Unknown procedure 'sp_create_order_monthly_tables'`

A：可能是 `DELIMITER` 未被识别（部分 GUI 工具如 DBeaver 默认不识别 DELIMITER）。

- 用 `mysql` 命令行执行（推荐）
- 或改用 GUI 时先执行 CREATE PROCEDURE 部分，把 DELIMITER 包裹的 BEGIN..END 块单独跑

### Q2：手动添加未来月份的分表

```sql
-- 假设要预生成 202608
CALL sp_create_order_monthly_tables('202608');
SHOW TABLES LIKE 'order_takeout_202608';   -- 应返回 1 行
```

详见 `jobs/monthly-table-job.md` §五。

### Q3：region 表行数不够，城市选不到

A：seeds/02_region.sql 首版仅含 ~150 行（全部 34 省级 + 4 直辖市完整 + 部分热门省会）。
完整 4000+ 行补全方案见该文件头三种方案（LOAD DATA / NestJS / 第三方包）。

### Q4：Super 账号登录失败

A：默认密码 hash 是占位串（不可登录，安全设计）。激活步骤见 `seeds/04_admin.sql` 文件头第 2 节"激活流程"。

### Q5：TimescaleDB 容器启动失败 / docker-entrypoint-initdb.d 报错

A：常见原因：

1. 数据卷不为空（容器只在首次启动空数据目录时执行 initdb.d）；删卷重建：
   ```bash
   docker compose -f 部署/docker-compose.dev.yml down -v
   docker compose -f 部署/docker-compose.dev.yml up -d
   ```
2. 挂载路径含中文（部分 Docker Desktop 版本对中文路径敏感）；改用挂在英文路径下的副本

---

## 八、表清单总览（70 张 MySQL 表 + 1 PostgreSQL 超表）

| 领域           | 表数      | 列表                                                                                                                                                                             |
| -------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 账号与认证  | 14        | user, user_address, merchant, merchant_qualification, merchant_staff, rider, rider_qualification, rider_deposit, admin, role, permission, admin_role, role_permission, blacklist |
| D2 地址与区域  | 2         | region, delivery_area                                                                                                                                                            |
| D3 店铺与商品  | 7         | shop, shop_business_hour, product_category, product, product_sku, product_combo_item, product_favorite                                                                           |
| D4 订单        | 6（模板） | order_takeout_template, order_takeout_item_template, order_errand_template, order_status_log_template, order_proof, order_after_sale                                             |
| D5 支付与财务  | 9         | payment_record, refund_record, account, account_flow, settlement_rule, settlement_record, withdraw_record, invoice, reconciliation                                               |
| D6 配送调度    | 7         | dispatch_record, transfer_record, abnormal_report, rider_preference, delivery_track_summary, rider_attendance, rider_reward                                                      |
| D7 营销        | 7         | coupon, user_coupon, promotion, red_packet, user_point, user_point_flow, invite_relation                                                                                         |
| D8 评价售后    | 6         | review, review_reply, review_appeal, complaint, arbitration, ticket                                                                                                              |
| D9 消息通知    | 4         | message_template, message_inbox, push_record, notice                                                                                                                             |
| D10 系统运营   | 8         | sys_dict, sys_config, operation_log, api_log, banner, hot_search, file_meta, home_recommend                                                                                      |
| **MySQL 合计** | **70**    | + 1 存储过程 + 8 张订单物理分表（202604~202605）                                                                                                                                 |
| TimescaleDB    | 1         | rider_location_ts（hypertable）                                                                                                                                                  |

---

## 九、变更与版本

| 日期       | 版本    | 变更                                   |
| ---------- | ------- | -------------------------------------- |
| 2026-04-19 | P2 V1.0 | 首版交付，覆盖 23 项 WBS（T2.1~T2.23） |
