/**
 * @file entities/index.ts
 * @stage P3/T3.3
 * @desc D1 账号域 14 + D10 系统域共享 Entity 桶形（barrel）出口
 * @author 员工 A（D1 14 个）+ 员工 C（D10 file_meta）+ 组长协调（聚合）
 *
 * D1 账号域 14 张表（顺序对齐 P2 01_account.sql）：
 *   1) user / 2) user_address / 3) merchant / 4) merchant_qualification /
 *   5) merchant_staff / 6) rider / 7) rider_qualification / 8) rider_deposit /
 *   9) admin / 10) role / 11) permission / 12) admin_role /
 *   13) role_permission / 14) blacklist
 *
 * D10 系统域共享：
 *   file_meta（员工 C 的 file 模块依赖；其他系统表后续阶段补齐）
 */

export { BaseEntity } from './base.entity'

// ===== D1 账号域 14 个 =====
export { User } from './user.entity'
export { UserAddress } from './user-address.entity'
export { Merchant } from './merchant.entity'
export { MerchantQualification } from './merchant-qualification.entity'
export { MerchantStaff } from './merchant-staff.entity'
export { Rider } from './rider.entity'
export { RiderQualification } from './rider-qualification.entity'
export { RiderDeposit } from './rider-deposit.entity'
export { Admin } from './admin.entity'
export { Role } from './role.entity'
export { Permission } from './permission.entity'
export { AdminRole } from './admin-role.entity'
export { RolePermission } from './role-permission.entity'
export { Blacklist } from './blacklist.entity'

// ===== D10 系统域共享 =====
export { FileMeta } from './system/file-meta.entity'
// 员工 B 增量：操作日志（admin/blacklist 服务依赖）
export { OperationLog } from './system/operation-log.entity'

// ===== D9 消息域 4 张表（员工 B / T3.13 增量） =====
export { MessageTemplate } from './message/message-template.entity'
export { MessageInbox } from './message/message-inbox.entity'
export { PushRecord } from './message/push-record.entity'
export { Notice } from './message/notice.entity'

// ===== P4/T4.1~T4.5 D2 增量 + D3 全部 =====
export { DeliveryArea } from './delivery-area.entity'
export type { GeoJsonPolygon } from './delivery-area.entity'
export { Shop } from './shop.entity'
export { ShopBusinessHour } from './shop-business-hour.entity'
export { ProductCategory } from './product-category.entity'
export { Product } from './product.entity'
export { ProductSku } from './product-sku.entity'
export type { SkuSpecItem } from './product-sku.entity'
export { ProductComboItem } from './product-combo-item.entity'
export { ProductFavorite } from './product-favorite.entity'

// ===== P4/T4.9~T4.13 D7 营销域 7 张表（Sprint 2） =====
export { Coupon } from './coupon.entity'
export { UserCoupon } from './user-coupon.entity'
export { Promotion } from './promotion.entity'
export { RedPacket } from './red-packet.entity'
export { UserPoint } from './user-point.entity'
export { UserPointFlow } from './user-point-flow.entity'
export { InviteRelation } from './invite-relation.entity'

// ===== P4/T4.14~T4.23 D4 订单域（Sprint 3） =====
// 注：4 个分表 entity（OrderTakeout / OrderTakeoutItem / OrderErrand / OrderStatusLog）
//      不带 @Entity 装饰器，仅为数据契约；service 层用 OrderShardingHelper 拼接
//      物理表名 + EntityManager.query / QueryBuilder.from(table) 动态查询
export { OrderTakeout } from './order/order-takeout.entity'
export { OrderTakeoutItem } from './order/order-takeout-item.entity'
export { OrderErrand } from './order/order-errand.entity'
export { OrderStatusLog } from './order/order-status-log.entity'
export { OrderProof } from './order/order-proof.entity'
export { OrderAfterSale } from './order/order-after-sale.entity'

// ===== P4/T4.24~T4.29 D5 财务/支付域（Sprint 4 + 5） =====
export { PaymentRecord } from './finance/payment-record.entity'
export { RefundRecord } from './finance/refund-record.entity'
export { Account } from './finance/account.entity'
export { AccountFlow } from './finance/account-flow.entity'
export { SettlementRule } from './finance/settlement-rule.entity'
export { SettlementRecord } from './finance/settlement-record.entity'
export { WithdrawRecord } from './finance/withdraw-record.entity'
export { Invoice } from './finance/invoice.entity'
export { Reconciliation } from './finance/reconciliation.entity'

// ===== P4/T4.36~T4.43 D6 派单域（Sprint 6） =====
export { DispatchRecord } from './dispatch/dispatch-record.entity'
export { TransferRecord } from './dispatch/transfer-record.entity'
export { AbnormalReport } from './dispatch/abnormal-report.entity'
export { RiderPreference } from './dispatch/rider-preference.entity'
export { DeliveryTrackSummary } from './dispatch/delivery-track-summary.entity'
export { RiderAttendance } from './dispatch/rider-attendance.entity'
export { RiderReward } from './dispatch/rider-reward.entity'

// ===== P4/T4.44~T4.48 D8 评价域（Sprint 7） =====
export { Review } from './review/review.entity'
export { ReviewReply } from './review/review-reply.entity'
export { ReviewAppeal } from './review/review-appeal.entity'
export { Complaint } from './review/complaint.entity'
export { Arbitration } from './review/arbitration.entity'
export { Ticket } from './review/ticket.entity'

// ===== P9 Sprint 2 / W2.B.2（P9-P1-09）Saga 状态持久化 =====
export * from './saga-state.entity'

// ===== P9 Sprint 3 / W3.B.2 DLQ 自动重试日志 =====
export * from './dlq-retry-log.entity'

import { User } from './user.entity'
import { UserAddress } from './user-address.entity'
import { Merchant } from './merchant.entity'
import { MerchantQualification } from './merchant-qualification.entity'
import { MerchantStaff } from './merchant-staff.entity'
import { Rider } from './rider.entity'
import { RiderQualification } from './rider-qualification.entity'
import { RiderDeposit } from './rider-deposit.entity'
import { Admin } from './admin.entity'
import { Role } from './role.entity'
import { Permission } from './permission.entity'
import { AdminRole } from './admin-role.entity'
import { RolePermission } from './role-permission.entity'
import { Blacklist } from './blacklist.entity'
import { FileMeta } from './system/file-meta.entity'
import { OperationLog } from './system/operation-log.entity'
import { MessageTemplate } from './message/message-template.entity'
import { MessageInbox } from './message/message-inbox.entity'
import { PushRecord } from './message/push-record.entity'
import { Notice } from './message/notice.entity'
import { DeliveryArea } from './delivery-area.entity'
import { Shop } from './shop.entity'
import { ShopBusinessHour } from './shop-business-hour.entity'
import { ProductCategory } from './product-category.entity'
import { Product } from './product.entity'
import { ProductSku } from './product-sku.entity'
import { ProductComboItem } from './product-combo-item.entity'
import { ProductFavorite } from './product-favorite.entity'
import { Coupon } from './coupon.entity'
import { UserCoupon } from './user-coupon.entity'
import { Promotion } from './promotion.entity'
import { RedPacket } from './red-packet.entity'
import { UserPoint } from './user-point.entity'
import { UserPointFlow } from './user-point-flow.entity'
import { InviteRelation } from './invite-relation.entity'
import { OrderProof } from './order/order-proof.entity'
import { OrderAfterSale } from './order/order-after-sale.entity'
import { PaymentRecord } from './finance/payment-record.entity'
import { RefundRecord } from './finance/refund-record.entity'
import { Account } from './finance/account.entity'
import { AccountFlow } from './finance/account-flow.entity'
import { SettlementRule } from './finance/settlement-rule.entity'
import { SettlementRecord } from './finance/settlement-record.entity'
import { WithdrawRecord } from './finance/withdraw-record.entity'
import { Invoice } from './finance/invoice.entity'
import { Reconciliation } from './finance/reconciliation.entity'
import { DispatchRecord } from './dispatch/dispatch-record.entity'
import { TransferRecord } from './dispatch/transfer-record.entity'
import { AbnormalReport } from './dispatch/abnormal-report.entity'
import { RiderPreference } from './dispatch/rider-preference.entity'
import { DeliveryTrackSummary } from './dispatch/delivery-track-summary.entity'
import { RiderAttendance } from './dispatch/rider-attendance.entity'
import { RiderReward } from './dispatch/rider-reward.entity'
import { Review } from './review/review.entity'
import { ReviewReply } from './review/review-reply.entity'
import { ReviewAppeal } from './review/review-appeal.entity'
import { Complaint } from './review/complaint.entity'
import { Arbitration } from './review/arbitration.entity'
import { Ticket } from './review/ticket.entity'
import { SagaState } from './saga-state.entity'
import { DlqRetryLog } from './dlq-retry-log.entity'

/**
 * D1 账号域 14 实体清单（数组形式）
 * 用途：DatabaseModule 注册 entities 全集；TypeOrmModule.forFeature 子模块按需选择
 */
export const D1_ENTITIES = [
  User,
  UserAddress,
  Merchant,
  MerchantQualification,
  MerchantStaff,
  Rider,
  RiderQualification,
  RiderDeposit,
  Admin,
  Role,
  Permission,
  AdminRole,
  RolePermission,
  Blacklist
] as const

/**
 * D10 系统域已落地实体清单
 * 用途：DatabaseModule 在 entities 中追加 ...D10_SYSTEM_ENTITIES
 */
export const D10_SYSTEM_ENTITIES = [FileMeta, OperationLog] as const

/**
 * D9 消息域 4 实体（员工 B / T3.13 增量）
 * 用途：DatabaseModule 注册；MessageModule TypeOrmModule.forFeature 依赖
 */
export const D9_MESSAGE_ENTITIES = [MessageTemplate, MessageInbox, PushRecord, Notice] as const

/**
 * D2 配送域增量（P4/T4.2 落地）
 * 用途：ShopModule / OrderModule 通过 TypeOrmModule.forFeature 引入
 */
export const D2_REGION_ENTITIES = [DeliveryArea] as const

/**
 * D3 店铺与商品域 7 实体（P4/T4.1~T4.5 落地）
 * 用途：ShopModule / ProductModule TypeOrmModule.forFeature
 */
export const D3_SHOP_PRODUCT_ENTITIES = [
  Shop,
  ShopBusinessHour,
  ProductCategory,
  Product,
  ProductSku,
  ProductComboItem,
  ProductFavorite
] as const

/**
 * D7 营销域 7 实体（P4/T4.9~T4.12 落地，Sprint 2）
 * 用途：MarketingModule TypeOrmModule.forFeature
 */
export const D7_MARKETING_ENTITIES = [
  Coupon,
  UserCoupon,
  Promotion,
  RedPacket,
  UserPoint,
  UserPointFlow,
  InviteRelation
] as const

/**
 * D4 订单域全局实体（不分表的 2 张：order_proof / order_after_sale）
 * 用途：OrderModule / ReviewModule 注入
 * 注：4 张分表 entity 不在此处（service 通过 OrderShardingHelper 动态查询）
 */
export const D4_ORDER_GLOBAL_ENTITIES = [OrderProof, OrderAfterSale] as const

/**
 * D5 财务/支付域 9 实体（P4/T4.24~T4.35 落地，Sprint 4 + 5）
 * 用途：PaymentModule / FinanceModule TypeOrmModule.forFeature
 */
export const D5_FINANCE_ENTITIES = [
  PaymentRecord,
  RefundRecord,
  Account,
  AccountFlow,
  SettlementRule,
  SettlementRecord,
  WithdrawRecord,
  Invoice,
  Reconciliation
] as const

/**
 * D6 派单域 7 实体（P4/T4.36~T4.43 落地，Sprint 6）
 * 用途：DispatchModule / OrderModule TypeOrmModule.forFeature
 */
export const D6_DISPATCH_ENTITIES = [
  DispatchRecord,
  TransferRecord,
  AbnormalReport,
  RiderPreference,
  DeliveryTrackSummary,
  RiderAttendance,
  RiderReward
] as const

/**
 * D8 评价域 6 实体（P4/T4.44~T4.48 落地，Sprint 7）
 * 用途：ReviewModule TypeOrmModule.forFeature
 */
export const D8_REVIEW_ENTITIES = [
  Review,
  ReviewReply,
  ReviewAppeal,
  Complaint,
  Arbitration,
  Ticket
] as const

/**
 * 编排域实体（P9 Sprint 2 / W2.B.2 / P9-P1-09 + P9 Sprint 3 / W3.B.2）
 * 用途：DatabaseModule 注册；OrchestrationModule / FinanceModule 内
 *      TypeOrmModule.forFeature 引入
 */
export const ORCHESTRATION_ENTITIES = [SagaState, DlqRetryLog] as const

/** 全部已落地实体（DatabaseModule 一次注册） */
export const ALL_ENTITIES = [
  ...D1_ENTITIES,
  ...D10_SYSTEM_ENTITIES,
  ...D9_MESSAGE_ENTITIES,
  ...D2_REGION_ENTITIES,
  ...D3_SHOP_PRODUCT_ENTITIES,
  ...D7_MARKETING_ENTITIES,
  ...D4_ORDER_GLOBAL_ENTITIES,
  ...D5_FINANCE_ENTITIES,
  ...D6_DISPATCH_ENTITIES,
  ...D8_REVIEW_ENTITIES,
  ...ORCHESTRATION_ENTITIES
] as const
