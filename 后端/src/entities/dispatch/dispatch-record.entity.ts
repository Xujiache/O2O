/**
 * @file dispatch-record.entity.ts
 * @stage P4/T4.36（Sprint 6）
 * @desc TypeORM Entity：D6.1 dispatch_record —— 派单记录（对齐 06_dispatch.sql）
 * @author 单 Agent V2.0
 *
 * dispatch_mode：1 系统智能派 / 2 抢单 / 3 人工指派
 * status：0 派单中 / 1 已接受 / 2 拒绝 / 3 超时未应答 / 4 取消
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 派单记录
 */
@Entity({ name: 'dispatch_record' })
@Index('idx_order_created', ['orderNo', 'createdAt'])
@Index('idx_rider_status_created', ['riderId', 'status', 'createdAt'])
@Index('idx_status_expire', ['status', 'expireAt'])
export class DispatchRecord extends BaseEntity {
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

  @Column({
    name: 'dispatch_mode',
    type: 'tinyint',
    unsigned: true,
    comment: '派单模式：1 系统智能派 / 2 抢单 / 3 人工指派'
  })
  dispatchMode!: number

  @Column({
    name: 'rider_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '目标骑手 ID'
  })
  riderId!: string | null

  @Column({
    name: 'score',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
    comment: '匹配分数'
  })
  score!: string | null

  @Column({
    name: 'distance_m',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '骑手到取件点距离（米）'
  })
  distanceM!: number | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 派单中 / 1 接受 / 2 拒绝 / 3 超时 / 4 取消'
  })
  status!: number

  @Column({
    name: 'accepted_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '骑手接受时间'
  })
  acceptedAt!: Date | null

  @Column({
    name: 'responded_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '骑手应答时间'
  })
  respondedAt!: Date | null

  @Column({
    name: 'reject_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '拒绝原因'
  })
  rejectReason!: string | null

  @Column({
    name: 'expire_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '应答超时时间'
  })
  expireAt!: Date | null

  @Column({
    name: 'op_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '人工指派管理员 ID'
  })
  opAdminId!: string | null

  @Column({
    name: 'extra',
    type: 'json',
    nullable: true,
    comment: '扩展信息（候选列表/算法版本等）'
  })
  extra!: Record<string, unknown> | null
}
