/**
 * @file rider-preference.entity.ts
 * @stage P4/T4.37（Sprint 6）
 * @desc TypeORM Entity：D6.4 rider_preference —— 骑手接单偏好（对齐 06_dispatch.sql）
 * @author 单 Agent V2.0
 *
 * accept_mode：1 系统派单 / 2 抢单 / 3 派单+抢单
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 骑手接单偏好
 */
@Entity({ name: 'rider_preference' })
@Index('uk_rider_id', ['riderId'], { unique: true })
export class RiderPreference extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'rider_id', type: 'bigint', unsigned: true, comment: '骑手 ID' })
  riderId!: string

  @Column({
    name: 'accept_mode',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '接单模式：1 系统派单 / 2 抢单 / 3 派单+抢单'
  })
  acceptMode!: number

  @Column({
    name: 'accept_radius_m',
    type: 'int',
    unsigned: true,
    default: 3000,
    comment: '接单半径（米）'
  })
  acceptRadiusM!: number

  @Column({
    name: 'accept_takeout',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '是否接外卖：0 否 / 1 是'
  })
  acceptTakeout!: number

  @Column({
    name: 'accept_errand',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '是否接跑腿：0 否 / 1 是'
  })
  acceptErrand!: number

  @Column({
    name: 'errand_types',
    type: 'json',
    nullable: true,
    comment: '接受的跑腿类型数组（[1,2,3,4]）'
  })
  errandTypes!: number[] | null

  @Column({
    name: 'accept_max_concurrent',
    type: 'smallint',
    unsigned: true,
    default: 5,
    comment: '同时配送最大数'
  })
  acceptMaxConcurrent!: number

  @Column({
    name: 'voice_enabled',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '语音播报：0 关 / 1 开'
  })
  voiceEnabled!: number
}
