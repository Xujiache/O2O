/**
 * @file order-takeout.entity.ts
 * @stage P4/T4.14（Sprint 3）
 * @desc 外卖订单数据契约（按月分表 order_takeout_YYYYMM；**不带 @Entity 装饰器**）
 * @author 单 Agent V2.0
 *
 * 因 P2 04_order.sql 设计为按月分表（202604、202605…），TypeORM 不直接管理
 * 模板表/物理分表，service 层通过 OrderShardingHelper.getTableName() 动态拼接
 * 表名，再用 EntityManager.query 或 createQueryBuilder().from(table, alias)
 * 显式指定查询表，本类仅作字段契约 / DTO 类型注解使用。
 *
 * 状态机（10 档，与 04_order.sql 文件头一致）：
 *   0 待支付 / 5 已关闭(支付超时) / 10 待接单 / 20 已接单待出餐 /
 *   30 出餐完成待取 / 40 配送中 / 50 已送达待确认 / 55 已完成 /
 *   60 已取消 / 70 售后中
 */

/**
 * 外卖订单（数据契约）
 */
export class OrderTakeout {
  id!: string
  tenantId!: number
  orderNo!: string
  userId!: string
  shopId!: string
  merchantId!: string
  riderId!: string | null
  goodsAmount!: string
  deliveryFee!: string
  packageFee!: string
  discountAmount!: string
  couponAmount!: string
  payAmount!: string
  addressSnapshot!: Record<string, unknown>
  shopSnapshot!: Record<string, unknown> | null
  remark!: string | null
  expectedArriveAt!: Date | null
  status!: number
  payStatus!: number
  payMethod!: number | null
  payNo!: string | null
  payAt!: Date | null
  acceptAt!: Date | null
  readyAt!: Date | null
  dispatchAt!: Date | null
  pickedAt!: Date | null
  deliveredAt!: Date | null
  finishedAt!: Date | null
  cancelAt!: Date | null
  cancelReason!: string | null
  refundAmount!: string
  isInvoice!: number
  invoiceId!: string | null
  isReviewed!: number
  isDeleted!: number
  createdAt!: Date
  updatedAt!: Date
  deletedAt!: Date | null
}
