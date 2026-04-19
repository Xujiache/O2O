/**
 * @file account-flow.entity.ts
 * @stage P4/T4.30（Sprint 5）
 * @desc TypeORM Entity：D5.4 account_flow —— 账户流水（对齐 05_finance.sql）
 * @author 单 Agent V2.0
 *
 * direction：1 入账 / 2 出账
 * biz_type：1 订单收入 / 2 订单退款 / 3 分账 / 4 提现 / 5 充值 / 6 奖励 / 7 罚款 / 8 调整
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 账户流水
 */
@Entity({ name: 'account_flow' })
@Index('uk_flow_no', ['flowNo'], { unique: true })
@Index('idx_account_created', ['accountId', 'createdAt'])
@Index('idx_owner_biz_created', ['ownerType', 'ownerId', 'bizType', 'createdAt'])
@Index('idx_related_no', ['relatedNo'])
export class AccountFlow extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'flow_no', type: 'varchar', length: 32, comment: '流水号' })
  flowNo!: string

  @Column({ name: 'account_id', type: 'bigint', unsigned: true, comment: '账户 ID' })
  accountId!: string

  @Column({
    name: 'owner_type',
    type: 'tinyint',
    unsigned: true,
    comment: '主体类型：1 用户 / 2 商户 / 3 骑手'
  })
  ownerType!: number

  @Column({ name: 'owner_id', type: 'bigint', unsigned: true, comment: '主体 ID' })
  ownerId!: string

  @Column({
    name: 'direction',
    type: 'tinyint',
    unsigned: true,
    comment: '方向：1 入账 / 2 出账'
  })
  direction!: number

  @Column({
    name: 'biz_type',
    type: 'tinyint',
    unsigned: true,
    comment:
      '业务类型：1 订单收入 / 2 订单退款 / 3 分账 / 4 提现 / 5 充值 / 6 奖励 / 7 罚款 / 8 调整'
  })
  bizType!: number

  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '发生额（始终正数）'
  })
  amount!: string

  @Column({
    name: 'balance_after',
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '操作后余额'
  })
  balanceAfter!: string

  @Column({
    name: 'related_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '关联业务单号'
  })
  relatedNo!: string | null

  @Column({
    name: 'remark',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '备注'
  })
  remark!: string | null

  @Column({
    name: 'op_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '操作管理员 ID（biz_type=8 调整时）'
  })
  opAdminId!: string | null
}
