/**
 * @file order-after-sale.entity.ts
 * @stage P4/T4.14 / T4.48（Sprint 3 + Sprint 7）
 * @desc TypeORM Entity：D4.6 order_after_sale —— 售后工单（对齐 04_order.sql）
 * @author 单 Agent V2.0
 *
 * type：1 仅退款 / 2 退货退款 / 3 换货 / 4 投诉
 * status：0 申请中 / 10 商户处理中 / 20 平台仲裁中 / 30 已同意 / 40 已拒绝 / 50 已退款 / 60 已关闭
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 售后工单
 * 用途：对应 PRD §3.1.4.4 售后管理 / §3.2.3.4 异常订单处理
 */
@Entity({ name: 'order_after_sale' })
@Index('uk_after_sale_no', ['afterSaleNo'], { unique: true })
@Index('idx_order_no', ['orderNo'])
@Index('idx_user_status', ['userId', 'status', 'createdAt'])
@Index('idx_shop_status', ['shopId', 'status', 'createdAt'])
@Index('idx_status_created', ['status', 'createdAt'])
export class OrderAfterSale extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({
    name: 'after_sale_no',
    type: 'varchar',
    length: 32,
    comment: '售后单号（AS+yyyyMMdd+seq）'
  })
  afterSaleNo!: string

  @Column({ name: 'order_no', type: 'char', length: 18, comment: '关联订单号' })
  orderNo!: string

  @Column({
    name: 'order_type',
    type: 'tinyint',
    unsigned: true,
    comment: '订单类型：1 外卖 / 2 跑腿'
  })
  orderType!: number

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, comment: '申请用户 ID' })
  userId!: string

  @Column({
    name: 'shop_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '店铺 ID（外卖时填）'
  })
  shopId!: string | null

  @Column({
    name: 'rider_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '骑手 ID'
  })
  riderId!: string | null

  @Column({
    name: 'type',
    type: 'tinyint',
    unsigned: true,
    comment: '类型：1 仅退款 / 2 退货退款 / 3 换货 / 4 投诉'
  })
  type!: number

  @Column({ name: 'reason_code', type: 'varchar', length: 64, comment: '原因编码' })
  reasonCode!: string

  @Column({
    name: 'reason_detail',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '原因描述'
  })
  reasonDetail!: string | null

  @Column({
    name: 'evidence_urls',
    type: 'json',
    nullable: true,
    comment: '证据图片数组'
  })
  evidenceUrls!: string[] | null

  @Column({
    name: 'apply_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '申请退款金额'
  })
  applyAmount!: string

  @Column({
    name: 'actual_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    comment: '实际退款金额（处理后填）'
  })
  actualAmount!: string | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment:
      '状态：0 申请中 / 10 商户处理中 / 20 平台仲裁中 / 30 已同意 / 40 已拒绝 / 50 已退款 / 60 已关闭'
  })
  status!: number

  @Column({
    name: 'merchant_reply',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '商户回复'
  })
  merchantReply!: string | null

  @Column({
    name: 'merchant_reply_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '商户回复时间'
  })
  merchantReplyAt!: Date | null

  @Column({
    name: 'arbitration_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '关联仲裁 ID'
  })
  arbitrationId!: string | null

  @Column({
    name: 'op_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '处理管理员 ID'
  })
  opAdminId!: string | null

  @Column({
    name: 'finish_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '完成时间'
  })
  finishAt!: Date | null
}
