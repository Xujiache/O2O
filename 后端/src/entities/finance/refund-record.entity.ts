/**
 * @file refund-record.entity.ts
 * @stage P4/T4.27（Sprint 4）
 * @desc TypeORM Entity：D5.2 refund_record —— 退款记录（对齐 05_finance.sql）
 * @author 单 Agent V2.0
 *
 * status：0 申请 / 1 处理中 / 2 成功 / 3 失败
 * refund_method：1 原路退回 / 2 退到余额
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 退款记录
 */
@Entity({ name: 'refund_record' })
@Index('uk_refund_no', ['refundNo'], { unique: true })
@Index('uk_out_refund', ['outRefundNo'], { unique: true })
@Index('idx_order_no', ['orderNo'])
@Index('idx_pay_no', ['payNo'])
@Index('idx_user_status', ['userId', 'status', 'createdAt'])
@Index('idx_after_sale', ['afterSaleNo'])
@Index('idx_status_created', ['status', 'createdAt'])
export class RefundRecord extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'refund_no', type: 'varchar', length: 28, comment: '退款单号' })
  refundNo!: string

  @Column({
    name: 'out_refund_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '第三方退款号'
  })
  outRefundNo!: string | null

  @Column({ name: 'pay_no', type: 'varchar', length: 28, comment: '原支付单号' })
  payNo!: string

  @Column({ name: 'order_no', type: 'char', length: 18, comment: '订单号' })
  orderNo!: string

  @Column({
    name: 'order_type',
    type: 'tinyint',
    unsigned: true,
    comment: '订单类型：1 外卖 / 2 跑腿'
  })
  orderType!: number

  @Column({
    name: 'after_sale_no',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '关联售后单号'
  })
  afterSaleNo!: string | null

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, comment: '退款用户 ID' })
  userId!: string

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2, comment: '本次退款金额' })
  amount!: string

  @Column({
    name: 'refund_method',
    type: 'tinyint',
    unsigned: true,
    comment: '退款方式：1 原路退回 / 2 退到余额'
  })
  refundMethod!: number

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 申请 / 1 处理中 / 2 成功 / 3 失败'
  })
  status!: number

  @Column({
    name: 'refund_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '退款完成时间'
  })
  refundAt!: Date | null

  @Column({
    name: 'raw_response',
    type: 'json',
    nullable: true,
    comment: '第三方退款返回'
  })
  rawResponse!: Record<string, unknown> | null

  @Column({
    name: 'error_code',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '失败代码'
  })
  errorCode!: string | null

  @Column({
    name: 'error_msg',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '失败描述'
  })
  errorMsg!: string | null

  @Column({
    name: 'op_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '操作管理员 ID（人工退款时）'
  })
  opAdminId!: string | null
}
