/**
 * @file order-status-log.entity.ts
 * @stage P4/T4.14（Sprint 3）
 * @desc 订单状态变更日志数据契约（按月分表 order_status_log_YYYYMM）
 * @author 单 Agent V2.0
 *
 * op_type：1 用户 / 2 商户 / 3 骑手 / 4 管理员 / 5 系统
 * 一笔订单平均 6~10 条日志，体量大故按月分表
 */

/**
 * 订单状态变更日志
 */
export class OrderStatusLog {
  id!: string
  tenantId!: number
  orderNo!: string
  orderType!: number
  fromStatus!: number | null
  toStatus!: number
  opType!: number
  opId!: string | null
  opIp!: Buffer | null
  remark!: string | null
  extra!: Record<string, unknown> | null
  isDeleted!: number
  createdAt!: Date
  updatedAt!: Date
  deletedAt!: Date | null
}
