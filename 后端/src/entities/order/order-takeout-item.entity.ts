/**
 * @file order-takeout-item.entity.ts
 * @stage P4/T4.14（Sprint 3）
 * @desc 外卖订单明细数据契约（按月分表 order_takeout_item_YYYYMM）
 * @author 单 Agent V2.0
 */

/**
 * 外卖订单明细
 */
export class OrderTakeoutItem {
  id!: string
  tenantId!: number
  orderNo!: string
  shopId!: string
  productId!: string
  skuId!: string
  productName!: string
  skuSpec!: string | null
  imageUrl!: string | null
  unitPrice!: string
  qty!: number
  packageFee!: string
  totalPrice!: string
  isComboItem!: number
  comboParentId!: string | null
  isDeleted!: number
  createdAt!: Date
  updatedAt!: Date
  deletedAt!: Date | null
}
