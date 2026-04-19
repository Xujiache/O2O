/**
 * @file order-errand.entity.ts
 * @stage P4/T4.14（Sprint 3）
 * @desc 跑腿订单数据契约（按月分表 order_errand_YYYYMM）
 * @author 单 Agent V2.0
 *
 * service_type：1 帮送 / 2 帮取 / 3 帮买 / 4 帮排队
 * 状态机（10 档）：与外卖类似
 */

/**
 * 跑腿订单
 */
export class OrderErrand {
  id!: string
  tenantId!: number
  orderNo!: string
  userId!: string
  riderId!: string | null
  serviceType!: number
  pickupSnapshot!: Record<string, unknown> | null
  deliverySnapshot!: Record<string, unknown> | null
  itemType!: string | null
  itemWeightG!: number | null
  itemValue!: string | null
  buyList!: Array<Record<string, unknown>> | null
  buyBudget!: string | null
  queuePlace!: string | null
  queueType!: string | null
  queueDurationMin!: number | null
  pickupCode!: string | null
  expectedPickupAt!: Date | null
  serviceFee!: string
  tipFee!: string
  insuranceFee!: string
  estimatedGoods!: string
  payAmount!: string
  remark!: string | null
  status!: number
  payStatus!: number
  payMethod!: number | null
  payNo!: string | null
  payAt!: Date | null
  acceptAt!: Date | null
  dispatchAt!: Date | null
  pickedAt!: Date | null
  deliveredAt!: Date | null
  finishedAt!: Date | null
  cancelAt!: Date | null
  cancelReason!: string | null
  refundAmount!: string
  isReviewed!: number
  isDeleted!: number
  createdAt!: Date
  updatedAt!: Date
  deletedAt!: Date | null
}
