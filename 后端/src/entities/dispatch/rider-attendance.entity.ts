/**
 * @file rider-attendance.entity.ts
 * @stage P4/T4.43（Sprint 6）
 * @desc TypeORM Entity：D6.6 rider_attendance —— 骑手考勤（对齐 06_dispatch.sql）
 * @author 单 Agent V2.0
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 骑手考勤
 */
@Entity({ name: 'rider_attendance' })
@Index('uk_rider_date', ['riderId', 'attDate'], { unique: true })
@Index('idx_att_date', ['attDate'])
export class RiderAttendance extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'rider_id', type: 'bigint', unsigned: true, comment: '骑手 ID' })
  riderId!: string

  @Column({ name: 'att_date', type: 'date', comment: '考勤日期' })
  attDate!: Date

  @Column({
    name: 'clock_in_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '上班打卡时间'
  })
  clockInAt!: Date | null

  @Column({
    name: 'clock_in_lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '上班打卡经度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  clockInLng!: number | null

  @Column({
    name: 'clock_in_lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '上班打卡纬度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  clockInLat!: number | null

  @Column({
    name: 'clock_out_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '下班打卡时间'
  })
  clockOutAt!: Date | null

  @Column({
    name: 'clock_out_lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '下班打卡经度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  clockOutLng!: number | null

  @Column({
    name: 'clock_out_lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '下班打卡纬度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  clockOutLat!: number | null

  @Column({
    name: 'online_seconds',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '在线时长（秒）'
  })
  onlineSeconds!: number

  @Column({
    name: 'delivered_count',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '当日配送单量'
  })
  deliveredCount!: number

  @Column({
    name: 'is_leave',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '是否请假：0 否 / 1 是'
  })
  isLeave!: number

  @Column({
    name: 'leave_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '请假原因'
  })
  leaveReason!: string | null
}
