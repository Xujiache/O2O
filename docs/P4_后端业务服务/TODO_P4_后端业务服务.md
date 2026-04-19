# TODO_P4_后端业务服务

## 一、进行中
- [ ] —

## 二、待办

### M4.1 Shop + Product
- [x] T4.1 Shop CRUD + 营业时间 + 公告
- [x] T4.2 配送区域 polygon + 缓存
- [x] T4.3 店铺列表 GEO/排序/筛选
- [x] T4.4 Product Category CRUD
- [x] T4.5 Product + SKU + 套餐 CRUD
- [x] T4.6 InventoryService（Redis Lua + DB CAS）
- [x] T4.7 上下架/排序
- [x] T4.8 用户端查询接口

### M4.2 Marketing
- [x] T4.9 优惠券模板 CRUD
- [x] T4.10 用户券发放 & 领取
- [x] T4.11 活动规则引擎
- [x] T4.12 红包池 & 积分
- [x] T4.13 下单优惠计算与互斥

### M4.3 Order
- [x] T4.14 Order Entity
- [x] T4.15 OrderStateMachine
- [x] T4.16 pre-check
- [x] T4.17 外卖下单
- [x] T4.18 跑腿下单（4 种）
- [x] T4.19 跑腿价格预估
- [x] T4.20 取消/关单
- [x] T4.21 取件/送达/异常/转单
- [x] T4.22 订单查询
- [x] T4.23 事件发布

### M4.4 Payment
- [x] T4.24 微信 V3 + 回调
- [x] T4.25 支付宝 + 回调
- [x] T4.26 余额支付
- [x] T4.27 退款
- [x] T4.28 对账任务
- [x] T4.29 支付状态机

### M4.5 Finance
- [x] T4.30 Account + 乐观锁
- [x] T4.31 分账规则 CRUD
- [x] T4.32 分账 T+1
- [x] T4.33 提现
- [x] T4.34 发票
- [x] T4.35 对账差异报表

### M4.6 Dispatch
- [x] T4.36 Dispatch/Transfer CRUD
- [x] T4.37 候选骑手筛选
- [x] T4.38 评分算法
- [x] T4.39 系统派单 Worker
- [x] T4.40 抢单 Lua
- [x] T4.41 顺路单
- [x] T4.42 转单
- [x] T4.43 运力看板

### M4.7 Review
- [x] T4.44 评价 + 回复
- [x] T4.45 申诉审核
- [x] T4.46 投诉 & 工单
- [x] T4.47 仲裁
- [x] T4.48 售后工单

### M4.8 收尾（Sprint 8 本次完成）
- [x] T4.49 Orchestration + Saga
- [x] T4.50 外卖闭环联调
- [x] T4.51 跑腿闭环联调
- [x] T4.52 单测覆盖 ≥ 70%
- [x] T4.53 Postman 集合
- [x] T4.54 更新说明文档

## 三、已完成
- 2026-04-19 Sprint 1（T4.1~T4.8）：Shop + Product 全部 8 项 ✅；新增 8 entities（Shop / ShopBusinessHour / DeliveryArea / ProductCategory / Product / ProductSku / ProductComboItem / ProductFavorite）；shop 模块 11 接口（商户端 11 + 用户端 2 + 管理端 4）；product 模块 17 接口（商户端 11 + 用户端 2 + 管理端 2 + category 4）；InventoryService Redis Lua + DB CAS + 17 单测;累计 12 套件 / 111 测试全过
- 2026-04-19 Sprint 2（T4.9~T4.13）：Marketing 全部 5 项 ✅；新增 7 entities（Coupon / UserCoupon / Promotion / RedPacket / UserPoint / UserPointFlow / InviteRelation）+ 1 Lua（red_packet_grab）+ 装 bignumber.js；marketing 模块 9 service / 13 controller / **48 接口**（Coupon 16 + Promotion 17 + RedPacket 8 + Point 3 + Invite 4）；DiscountCalc 互斥规则 + 5 类 promo_type 规则引擎 + 拼单 Redis Set 原子计数 + 红包 Lua 原子防超发 + UserPoint version 乐观锁 CAS + 邀请绑定防自邀；累计 12 套件 / 111 测试全过（持平 Sprint 1 基线）
- 2026-04-19 Sprint 3（T4.14~T4.23）：Order 全部 10 项 ✅；新增 7 entities（OrderTakeout / OrderErrand / OrderTakeoutItem / OrderStatusLog / OrderProof / OrderAfterSale + sharding helper）；OrderStateMachine 10 状态变迁矩阵 + 分布式锁 + 事务 CAS；外卖 + 跑腿下单含 BullMQ 15min 超时关单；事件发布 AMQP + InMemory 双模式
- 2026-04-19 Sprint 4（T4.24~T4.29）：Payment 全部 6 项 ✅；3 adapter（wxpay/alipay/balance）+ 6 service + 5 controller + PaymentStateMachine + 对账 cron + 事件发布
- 2026-04-19 Sprint 5（T4.30~T4.35）：Finance 全部 6 项 ✅；7 service（Account/SettlementRule/Settlement/SettlementCron/Withdraw/Invoice/ReconciliationReport）+ 4 controller + AccountService 全程 CAS + Settlement 5 步流程 + Excel 导出
- 2026-04-19 Sprint 6（T4.36~T4.43）：Dispatch 全部 8 项 ✅；8 service + 3 controller + ScoringService 多因素评分（distance/capacity/routeMatch/rating - penalty）+ BullMQ 15s 超时 next + 抢单 Lua + 顺路匹配
- 2026-04-19 Sprint 7（T4.44~T4.48）：Review 全部 5 项 ✅；7 service（Review/ReviewReply/ReviewAppeal/Complaint/Ticket/Arbitration/AfterSale）+ 4 controller + 跨模块依赖 OrderModule + PaymentModule（forwardRef + Symbol token）
- 2026-04-19 Sprint 8（T4.49~T4.54）：Orchestration + 收尾全部 6 项 ✅；新增 Orchestration 模块（11 个文件：types + saga-runner + 4 个 Saga + 3 consumer + DLQ processor + module）；7 个新 spec（state-machine 13 / discount-calc 9 / account 13 / settlement 10 / scoring 12 / payment-state-machine 9 / saga-runner 8 = 共 74 测试）；2 个 e2e（takeout 10 测试 + errand 11 测试 = 21 测试）；Postman 54 用例 / 8 模块；P4_COMPLETION_REPORT.md 输出；累计 19 套件 / 185 测试全过（基线 12/111 → +7 套件 +74 测试）；coverage lines 70.32% ≥ V4 验收标准；build Exit 0；ReadLints 0 错；grep `:any`/`console.log` 双 0 命中

## 四、阻塞
| 任务 | 原因 | 责任人 | 预计解除 |
|---|---|---|---|
| - | - | - | - |

## 五、变更记录
| 日期 | 变更内容 | 变更人 |
|---|---|---|
| 2026-04-18 | 初建，依据 TASK_P4 拆解 | 架构组 |
| 2026-04-19 | Sprint 1（T4.1~T4.8）完成：Shop + Product + InventoryService。8 entities + 27 接口 + 17 单测；build Exit 0；test 12/111 全过；ReadLints 0 错；grep `:any`/`console.log` 双 0 命中 | 单 Agent V2.0 |
| 2026-04-19 | Sprint 2（T4.9~T4.13）完成：Marketing 全模块。7 entities + 1 Lua + 9 service + 13 controller + **48 接口**；新增依赖 bignumber.js；DiscountCalc 互斥规则引擎 + 拼单 Redis 原子 + 红包 Lua 防超发 + UserPoint version CAS；build Exit 0；test 12/111 维持基线；ReadLints 0 错；grep `:any`/`console.log` 双 0 命中 | 单 Agent V2.0 |
| 2026-04-19 | Sprint 3~7（T4.14~T4.48）完成：Order/Payment/Finance/Dispatch/Review 5 大业务 + 35 项 WBS；累计 200+ HTTP 端点；62 entities；3 个核心 Lua（stock_deduct/stock_restore/grab_order/red_packet_grab）；build Exit 0 / test 12/111 持平 | 单 Agent V2.0 |
| 2026-04-19 | **Sprint 8 收官（T4.49~T4.54）完成**：Orchestration + Saga 编排（11 文件 / 4 Saga / 双模式 Consumer / DLQ processor）+ 7 个核心算法单测 spec（74 测试）+ 2 个闭环 e2e（21 测试）+ Postman 54 用例 + P4_COMPLETION_REPORT.md。**累计 19 套件 / 185 测试全过**（基线 12/111 → +7 套件 +74 测试）；coverage lines **70.32%** 已达 V4 验收标准；build Exit 0；ReadLints 0 错；grep `:any`/`console.log` 双 0 命中。§3.1 P4 置 🟡（等 Cascade 复审），不自行升 🟢 | 单 Agent V2.0 |
| 2026-04-19 | P4-REVIEW-01 第 1 轮修复完成（I-01~I-06 共 6 项 P1） | 单 Agent V2.0（修复轮次 R1） |
