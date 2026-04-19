/**
 * @file user-point.entity.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc TypeORM Entity：D7.5 user_point —— 用户积分余额（对齐 07_marketing.sql 第 5 张表）
 * @author 单 Agent V2.0
 *
 * 一个用户一条记录（uk_user_id）；写操作必须配合 version 乐观锁 CAS
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from './base.entity'

/**
 * 用户积分余额
 * 用途：对应 PRD §3.1.5.3 积分管理
 */
@Entity({ name: 'user_point' })
@Index('uk_user_id', ['userId'], { unique: true })
export class UserPoint extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, comment: '用户 ID' })
  userId!: string

  @Column({ name: 'total_point', type: 'int', unsigned: true, default: 0, comment: '可用积分' })
  totalPoint!: number

  @Column({
    name: 'frozen_point',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '冻结积分（兑换处理中）'
  })
  frozenPoint!: number

  @Column({
    name: 'total_earned',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '历史累计获得'
  })
  totalEarned!: number

  @Column({
    name: 'total_used',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '历史累计使用'
  })
  totalUsed!: number

  @Column({
    name: 'version',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '乐观锁版本号'
  })
  version!: number
}
