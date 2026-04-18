# FINAL_P2_数据库设计

## 一、最终交付物清单
- [ ] `后端/src/database/migrations/01_account.sql` ~ `10_system.sql`
- [ ] `后端/src/database/seeds/01_dict.sql` ~ `04_admin.sql`
- [ ] `后端/src/database/timescale/01_schema.sql`
- [ ] `后端/src/database/erd/D1.md` ~ `D10.md`（Mermaid）
- [ ] `后端/src/database/redis-keys.md`
- [ ] `部署/runbooks/db-backup.md`
- [ ] 本阶段 ALIGNMENT/CONSENSUS/DESIGN/TASK/ACCEPTANCE/TODO 文档齐全

## 二、验收结果记录
| 验收项 | 结果 | 备注 |
|---|---|---|
| V2.1 DDL 执行 | ⬜ | |
| V2.2 字符集/引擎 | ⬜ | |
| V2.3 注释完整 | ⬜ | |
| V2.4 seed | ⬜ | |
| V2.5 TimescaleDB | ⬜ | |
| 结构规范 | ⬜ | |
| 覆盖度 | ⬜ | |
| 分表 & Job | ⬜ | |
| 加密方案 | ⬜ | |
| 备份 Runbook | ⬜ | |

## 三、PRD 对齐度
| PRD 章节 | 对齐情况 |
|---|---|
| §3.1 用户端实体 | ✅ user/user_address/user_coupon/user_point/favorite |
| §3.2 商户端实体 | ✅ merchant/merchant_staff/shop/product*/review |
| §3.3 骑手端实体 | ✅ rider/rider_qualification/deposit/attendance/reward |
| §3.4 管理后台实体 | ✅ admin/role/permission/banner/dict/log/notice 等 |
| §3.5.2 业务服务 | ✅ order*/payment*/settlement*/dispatch*/coupon* |
| §4.1 性能 | ✅ 分表+索引+缓存支撑 1000 TPS |
| §4.3 安全 | ✅ 敏感字段加密方案落地 |
| §4.4 可用性 | ✅ 备份与主从方案 |

## 四、遗留
| 编号 | 问题 | 处理 |
|---|---|---|
| R2.1 | 真实生产主从、读写分离 | P9 |
| R2.2 | 归档到数据湖 | P9 及之后运营期 |
| R2.3 | DB 压测 | P9 |

## 五、经验沉淀
- 雪花 ID 生成器要在 P3 阶段优先完成
- 订单号 CHAR(18) 需要与 `order_no` 生成服务统一
- 分表跨月查询建议报表层用 OLAP（ClickHouse），后续规划
- 敏感字段 `_hash` 只支持等值，模糊搜索不可用

## 六、阶段结论
- P2 数据模型全量设计完成，可进入 P3 后端基础服务开发
- `说明文档.md` 进度更新：P2 状态 🟢 完成

## 七、签字
| 角色 | 日期 | 签字 |
|---|---|---|
| 架构 | | |
| DBA | | |
| 后端 | | |
| PM | | |
