/**
 * @file delivery-track-summary.entity.ts
 * @stage P4/T4.43（Sprint 6）
 * @desc TypeORM Entity：D6.5 delivery_track_summary —— 配送轨迹摘要（对齐 06_dispatch.sql）
 * @author 单 Agent V2.0
 *
 * 详细轨迹点存 TimescaleDB rider_location_ts；本表存订单级聚合摘要
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 配送轨迹摘要
 */
@Entity({ name: 'delivery_track_summary' })
@Index('uk_order_no', ['orderNo'], { unique: true })
@Index('idx_rider_delivered', ['riderId', 'deliveredAt'])
@Index('idx_on_time', ['isOnTime', 'createdAt'])
export class DeliveryTrackSummary extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'order_no', type: 'char', length: 18, comment: '订单号' })
  orderNo!: string

  @Column({
    name: 'order_type',
    type: 'tinyint',
    unsigned: true,
    comment: '订单类型：1 外卖 / 2 跑腿'
  })
  orderType!: number

  @Column({ name: 'rider_id', type: 'bigint', unsigned: true, comment: '骑手 ID' })
  riderId!: string

  @Column({
    name: 'pickup_lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '取件点经度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  pickupLng!: number | null

  @Column({
    name: 'pickup_lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '取件点纬度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  pickupLat!: number | null

  @Column({
    name: 'delivery_lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '送达点经度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  deliveryLng!: number | null

  @Column({
    name: 'delivery_lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    comment: '送达点纬度',
    transformer: {
      to: (v?: number | string | null) => v,
      from: (v?: string | number | null) => (v == null ? null : Number(v))
    }
  })
  deliveryLat!: number | null

  @Column({
    name: 'total_distance_m',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '总配送距离（米）'
  })
  totalDistanceM!: number

  @Column({
    name: 'total_duration_s',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '总配送时长（秒）'
  })
  totalDurationS!: number

  @Column({
    name: 'pickup_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '取件完成时间'
  })
  pickupAt!: Date | null

  @Column({
    name: 'delivered_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '送达时间'
  })
  deliveredAt!: Date | null

  @Column({
    name: 'is_on_time',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '是否准时：0 否 / 1 是 / NULL 未结算'
  })
  isOnTime!: number | null

  @Column({
    name: 'delay_s',
    type: 'int',
    nullable: true,
    comment: '延迟秒数（负数=提前送达）'
  })
  delayS!: number | null

  @Column({
    name: 'track_first_chunk_id',
    type: 'bigint',
    nullable: true,
    comment: 'TimescaleDB 第一段 chunk 引用（仅用于审计）'
  })
  trackFirstChunkId!: string | null
}
