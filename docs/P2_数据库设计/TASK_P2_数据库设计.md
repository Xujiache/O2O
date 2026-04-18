# TASK_P2_数据库设计

> 本文件为 P2 阶段**任务拆解 WBS**。

## 一、WBS

| 编号 | 任务 | 依赖 | 产出 | 工时(h) | 负责 |
|---|---|---|---|---|---|
| T2.1 | 建库（o2o_platform）、字符集、用户与权限 | - | 数据库就绪 | 1 | DBA |
| T2.2 | D1 账号与认证 DDL（10张） | T2.1 | migrations/01_account.sql | 4 | 后端 |
| T2.3 | D2 地址与区域 DDL + region seed | T2.1 | 02_region.sql + seed | 2 | 后端 |
| T2.4 | D3 店铺与商品 DDL（8张） | T2.1 | 03_shop_product.sql | 3 | 后端 |
| T2.5 | D4 订单分表模板 + 月份自动建表存储过程 | T2.1 | 04_order.sql | 6 | 后端 |
| T2.6 | D5 支付与财务 DDL（9张） | T2.1 | 05_finance.sql | 4 | 后端 |
| T2.7 | D6 配送调度 DDL（7张） | T2.1 | 06_dispatch.sql | 3 | 后端 |
| T2.8 | D7 营销 DDL（7张） | T2.1 | 07_marketing.sql | 3 | 后端 |
| T2.9 | D8 评价售后 DDL（5张） | T2.1 | 08_review.sql | 2 | 后端 |
| T2.10 | D9 消息通知 DDL（4张） | T2.1 | 09_message.sql | 2 | 后端 |
| T2.11 | D10 系统运营 DDL（8张） | T2.1 | 10_system.sql | 3 | 后端 |
| T2.12 | sys_dict seed（订单状态/违规/行业/等级等） | T2.11 | seeds/01_dict.sql | 2 | 后端 |
| T2.13 | region seed（省市区） | T2.3 | seeds/02_region.sql | 2 | 后端 |
| T2.14 | role / permission seed | T2.11 | seeds/03_rbac.sql | 3 | 后端 |
| T2.15 | admin 超管种子账号 | T2.14 | seeds/04_admin.sql | 0.5 | 后端 |
| T2.16 | 月分表自动维护 Job（提前 1 月建下月表） | T2.5 | MigrationJob | 3 | 后端 |
| T2.17 | TimescaleDB 部署 + 建 hypertable | - | timescale/01_schema.sql | 3 | DBA |
| T2.18 | Redis Key 规范落地 `redis-keys.md` | - | 文档 | 1 | 架构 |
| T2.19 | ER 图（Mermaid 分领域 10 图） | T2.2~T2.11 | erd/*.md | 4 | 架构 |
| T2.20 | 加密字段设计评审 + 方案文档 | T2.2 | 文档 | 2 | 架构 |
| T2.21 | 备份与恢复 Runbook | T2.1 | 文档 | 2 | DBA |
| T2.22 | DDL 脚本在本地 docker mysql 全量执行通过 | T2.2~T2.12 | 验收 | 2 | 后端 |
| T2.23 | 更新 `说明文档.md` 进度 | T2.22 | 进度留痕 | 0.5 | PM |

**合计：约 53h ≈ 6.5 人日**

## 二、依赖关系

```
T2.1 → (T2.2..T2.11 并行) → T2.12..T2.15 → T2.22 → T2.23
T2.17 独立
T2.16 依赖 T2.5
T2.18..T2.21 可与 DDL 并行
```

## 三、优先级

| 级别 | 任务 |
|---|---|
| P0 | T2.1、T2.2、T2.4、T2.5、T2.6 |
| P1 | T2.3、T2.7~T2.11、T2.17、T2.22 |
| P2 | T2.12~T2.16、T2.18~T2.21、T2.23 |

## 四、里程碑

- M2.1 账号/店铺/订单/支付 DDL 可执行
- M2.2 全 DDL + seed 可执行
- M2.3 TimescaleDB 就绪、ER 图与文档齐全，进入 P3

## 五、状态跟踪

见 `TODO_P2_数据库设计.md`。
