/**
 * @file rider-reward.entity.ts
 * @stage P4/T4.43（Sprint 6）
 * @desc TypeORM Entity：D6.7 rider_reward —— 骑手奖励/罚款流水（对齐 06_dispatch.sql）
 * @author 单 Agent V2.0
 *
 * reward_type：1 奖励 / 2 罚款 / 3 补贴 / 4 等级升降
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 骑手奖励/罚款流水
 */
@Entity({ name: 'rider_reward' })
@Index('idx_rider_type_created', ['riderId', 'rewardType', 'createdAt'])
@Index('idx_appeal_status', ['isAppealed', 'appealStatus'])
export class RiderReward extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'rider_id', type: 'bigint', unsigned: true, comment: '骑手 ID' })
  riderId!: string

  @Column({
    name: 'reward_type',
    type: 'tinyint',
    unsigned: true,
    comment: '类型：1 奖励 / 2 罚款 / 3 补贴 / 4 等级升降'
  })
  rewardType!: number

  @Column({ name: 'reason_code', type: 'varchar', length: 64, comment: '原因编码' })
  reasonCode!: string

  @Column({
    name: 'reason_detail',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '原因详情'
  })
  reasonDetail!: string | null

  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '金额（reward_type=4 时为 0）'
  })
  amount!: string

  @Column({
    name: 'score_delta',
    type: 'int',
    default: 0,
    comment: '积分变化（评分/等级用）'
  })
  scoreDelta!: number

  @Column({
    name: 'related_order_no',
    type: 'char',
    length: 18,
    nullable: true,
    comment: '关联订单号'
  })
  relatedOrderNo!: string | null

  @Column({
    name: 'op_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '操作管理员 ID'
  })
  opAdminId!: string | null

  @Column({
    name: 'flow_no',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '关联账户流水号'
  })
  flowNo!: string | null

  @Column({
    name: 'is_appealed',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否申诉：0 否 / 1 是'
  })
  isAppealed!: number

  @Column({
    name: 'appeal_status',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '申诉状态：0 申诉中 / 1 同意 / 2 驳回'
  })
  appealStatus!: number | null
}
