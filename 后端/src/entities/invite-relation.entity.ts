/**
 * @file invite-relation.entity.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc TypeORM Entity：D7.7 invite_relation —— 邀请关系（对齐 07_marketing.sql 第 7 张表）
 * @author 单 Agent V2.0
 *
 * 一名用户只能被一名用户邀请（uk_invitee）
 * reward_status：0 未完成 / 1 已完成（被邀请人首单完成） / 2 已发放
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 邀请关系
 * 用途：对应 PRD §3.1.5.3 邀请有礼、§3.4.7.2 邀请活动
 */
@Entity({ name: 'invite_relation' })
@Index('uk_invitee', ['inviteeId'], { unique: true })
@Index('idx_inviter_status', ['inviterId', 'rewardStatus', 'createdAt'])
@Index('idx_invite_code', ['inviteCode'])
export class InviteRelation extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'inviter_id', type: 'bigint', unsigned: true, comment: '邀请人用户 ID' })
  inviterId!: string

  @Column({ name: 'invitee_id', type: 'bigint', unsigned: true, comment: '被邀请人用户 ID' })
  inviteeId!: string

  @Column({ name: 'invite_code', type: 'varchar', length: 32, comment: '邀请码' })
  inviteCode!: string

  @Column({
    name: 'channel',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '邀请渠道：wechat_share / poster / sms'
  })
  channel!: string | null

  @Column({
    name: 'reward_status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '奖励状态：0 未完成 / 1 已完成（被邀请人首单完成） / 2 已发放'
  })
  rewardStatus!: number

  @Column({
    name: 'reward_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '奖励发放时间'
  })
  rewardAt!: Date | null

  @Column({
    name: 'reward_remark',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '奖励说明（券 ID/积分数）'
  })
  rewardRemark!: string | null
}
