/**
 * @file rider-deposit.entity.ts
 * @stage P3/T3.3
 * @desc TypeORM Entity：D1.8 rider_deposit —— 骑手保证金记录
 *       （对齐 01_account.sql 第 8 张表）
 * @author 员工 A
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 骑手保证金记录（流水）
 * 用途：对应 PRD §3.3.1.3 保证金管理
 */
@Entity({ name: 'rider_deposit' })
@Index('idx_rider_created', ['riderId', 'createdAt'])
@Index('idx_op_type', ['opType', 'createdAt'])
export class RiderDeposit extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键' })
  id!: string

  @Column({ name: 'rider_id', type: 'bigint', unsigned: true, comment: '骑手 ID' })
  riderId!: string

  @Column({
    name: 'op_type',
    type: 'tinyint',
    unsigned: true,
    comment: '操作类型：1 缴纳 / 2 补缴 / 3 扣除 / 4 退还'
  })
  opType!: number

  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '金额（正数表示发生额；mysql2 默认 string 返回保留精度）'
  })
  amount!: string

  @Column({
    name: 'balance_after',
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '操作后保证金余额（mysql2 默认 string 返回）'
  })
  balanceAfter!: string

  @Column({
    name: 'pay_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '关联支付/退款单号'
  })
  payNo!: string | null

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true, comment: '说明' })
  reason!: string | null

  @Column({
    name: 'op_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '操作管理员 ID'
  })
  opAdminId!: string | null
}
