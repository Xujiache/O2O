/**
 * @file account.entity.ts
 * @stage P4/T4.30（Sprint 5）
 * @desc TypeORM Entity：D5.3 account —— 账户主表（对齐 05_finance.sql）
 * @author 单 Agent V2.0
 *
 * owner_type：1 用户 / 2 商户 / 3 骑手
 * 写操作必须配合 version 乐观锁 CAS（DESIGN_P4 §七）
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 账户主表
 */
@Entity({ name: 'account' })
@Index('uk_owner', ['ownerType', 'ownerId'], { unique: true })
export class Account extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({
    name: 'owner_type',
    type: 'tinyint',
    unsigned: true,
    comment: '账户主体类型：1 用户 / 2 商户 / 3 骑手'
  })
  ownerType!: number

  @Column({ name: 'owner_id', type: 'bigint', unsigned: true, comment: '主体 ID' })
  ownerId!: string

  @Column({
    name: 'balance',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '可用余额'
  })
  balance!: string

  @Column({
    name: 'frozen',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '冻结金额'
  })
  frozen!: string

  @Column({
    name: 'total_income',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0.0,
    comment: '累计收入'
  })
  totalIncome!: string

  @Column({
    name: 'total_expense',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0.0,
    comment: '累计支出'
  })
  totalExpense!: string

  @Column({
    name: 'version',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '乐观锁版本号'
  })
  version!: number

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '账户状态：0 冻结 / 1 正常'
  })
  status!: number
}
