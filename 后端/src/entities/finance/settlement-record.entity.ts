/**
 * @file settlement-record.entity.ts
 * @stage P4/T4.32（Sprint 5）
 * @desc TypeORM Entity：D5.6 settlement_record —— 分账记录（对齐 05_finance.sql）
 * @author 单 Agent V2.0
 *
 * 每笔订单产出 1~3 条（商户 / 骑手 / 平台）
 * status：0 待执行 / 1 已执行 / 2 失败 / 3 已撤销
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 分账记录
 */
@Entity({ name: 'settlement_record' })
@Index('uk_settlement_no', ['settlementNo'], { unique: true })
@Index('idx_order_target', ['orderNo', 'targetType'])
@Index('idx_target_status_created', ['targetType', 'targetId', 'status', 'createdAt'])
@Index('idx_status_settle_at', ['status', 'settleAt'])
export class SettlementRecord extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'settlement_no', type: 'varchar', length: 32, comment: '分账单号' })
  settlementNo!: string

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
    name: 'target_type',
    type: 'tinyint',
    unsigned: true,
    comment: '分账对象：1 商户 / 2 骑手 / 3 平台'
  })
  targetType!: number

  @Column({
    name: 'target_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '对象 ID（target_type=3 时为 NULL）'
  })
  targetId!: string | null

  @Column({ name: 'rule_id', type: 'bigint', unsigned: true, comment: '匹配的规则 ID' })
  ruleId!: string

  @Column({ name: 'base_amount', type: 'decimal', precision: 12, scale: 2, comment: '计算基数' })
  baseAmount!: string

  @Column({
    name: 'rate',
    type: 'decimal',
    precision: 8,
    scale: 4,
    default: 0,
    comment: '使用的比例'
  })
  rate!: string

  @Column({
    name: 'fixed_fee',
    type: 'decimal',
    precision: 8,
    scale: 2,
    default: 0.0,
    comment: '使用的固定费'
  })
  fixedFee!: string

  @Column({
    name: 'settle_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '实际分账金额'
  })
  settleAmount!: string

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 待执行 / 1 已执行 / 2 失败 / 3 已撤销'
  })
  status!: number

  @Column({
    name: 'settle_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '执行时间'
  })
  settleAt!: Date | null

  @Column({
    name: 'flow_no',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '关联账户流水号'
  })
  flowNo!: string | null

  @Column({
    name: 'error_msg',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '失败原因'
  })
  errorMsg!: string | null
}
