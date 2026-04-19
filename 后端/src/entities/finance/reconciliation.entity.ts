/**
 * @file reconciliation.entity.ts
 * @stage P4/T4.28 / T4.35（Sprint 4 + 5）
 * @desc TypeORM Entity：D5.9 reconciliation —— 渠道对账（对齐 05_finance.sql）
 * @author 单 Agent V2.0
 *
 * status：0 待对 / 1 已对平 / 2 有差异 / 3 处理中 / 4 已处理
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 渠道对账
 */
@Entity({ name: 'reconciliation' })
@Index('uk_recon_no', ['reconNo'], { unique: true })
@Index('uk_channel_date', ['channel', 'billDate'], { unique: true })
@Index('idx_status_bill_date', ['status', 'billDate'])
export class Reconciliation extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'recon_no', type: 'varchar', length: 32, comment: '对账单号' })
  reconNo!: string

  @Column({ name: 'channel', type: 'varchar', length: 32, comment: '渠道：wxpay / alipay / ...' })
  channel!: string

  @Column({ name: 'bill_date', type: 'date', comment: '对账日（自然日）' })
  billDate!: Date

  @Column({
    name: 'total_orders',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '订单总数（平台侧统计）'
  })
  totalOrders!: number

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0.0,
    comment: '订单总金额'
  })
  totalAmount!: string

  @Column({
    name: 'total_fee',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '渠道手续费合计'
  })
  totalFee!: string

  @Column({
    name: 'channel_orders',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '渠道侧订单数'
  })
  channelOrders!: number

  @Column({
    name: 'channel_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0.0,
    comment: '渠道侧金额'
  })
  channelAmount!: string

  @Column({ name: 'diff_count', type: 'int', unsigned: true, default: 0, comment: '差异笔数' })
  diffCount!: number

  @Column({
    name: 'diff_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0.0,
    comment: '差异金额'
  })
  diffAmount!: string

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 待对 / 1 已对平 / 2 有差异 / 3 处理中 / 4 已处理'
  })
  status!: number

  @Column({
    name: 'bill_file_url',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '渠道对账文件 URL'
  })
  billFileUrl!: string | null

  @Column({
    name: 'diff_file_url',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '差异明细 CSV URL'
  })
  diffFileUrl!: string | null

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
    comment: '处理完成时间'
  })
  finishAt!: Date | null
}
