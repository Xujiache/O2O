/**
 * @file complaint.entity.ts
 * @stage P4/T4.46（Sprint 7）
 * @desc TypeORM Entity：D8.4 complaint —— 投诉（对齐 08_review.sql）
 * @author 单 Agent V2.0
 *
 * complainant_type：1 用户 / 2 商户 / 3 骑手
 * target_type：1 用户 / 2 商户 / 3 骑手 / 4 平台
 * status：0 待处理 / 1 处理中 / 2 已解决 / 3 已关闭 / 4 转仲裁
 * severity：1 一般 / 2 中等 / 3 严重
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 投诉
 */
@Entity({ name: 'complaint' })
@Index('uk_complaint_no', ['complaintNo'], { unique: true })
@Index('idx_complainant_status_created', [
  'complainantType',
  'complainantId',
  'status',
  'createdAt'
])
@Index('idx_target_status_created', ['targetType', 'targetId', 'status', 'createdAt'])
@Index('idx_status_severity_created', ['status', 'severity', 'createdAt'])
@Index('idx_order_no', ['orderNo'])
export class Complaint extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'complaint_no', type: 'varchar', length: 32, comment: '投诉单号' })
  complaintNo!: string

  @Column({
    name: 'complainant_type',
    type: 'tinyint',
    unsigned: true,
    comment: '投诉方：1 用户 / 2 商户 / 3 骑手'
  })
  complainantType!: number

  @Column({ name: 'complainant_id', type: 'bigint', unsigned: true, comment: '投诉方 ID' })
  complainantId!: string

  @Column({
    name: 'target_type',
    type: 'tinyint',
    unsigned: true,
    comment: '被投诉对象：1 用户 / 2 商户 / 3 骑手 / 4 平台'
  })
  targetType!: number

  @Column({
    name: 'target_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '被投诉对象 ID'
  })
  targetId!: string | null

  @Column({
    name: 'order_no',
    type: 'char',
    length: 18,
    nullable: true,
    comment: '关联订单号'
  })
  orderNo!: string | null

  @Column({
    name: 'order_type',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '订单类型：1 外卖 / 2 跑腿'
  })
  orderType!: number | null

  @Column({ name: 'category', type: 'varchar', length: 64, comment: '投诉类别' })
  category!: string

  @Column({ name: 'content', type: 'varchar', length: 2000, comment: '投诉内容' })
  content!: string

  @Column({
    name: 'evidence_urls',
    type: 'json',
    nullable: true,
    comment: '证据图片/视频 URL 数组'
  })
  evidenceUrls!: string[] | null

  @Column({
    name: 'severity',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '严重等级：1 一般 / 2 中等 / 3 严重'
  })
  severity!: number

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 待处理 / 1 处理中 / 2 已解决 / 3 已关闭 / 4 转仲裁'
  })
  status!: number

  @Column({
    name: 'handle_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '处理管理员 ID'
  })
  handleAdminId!: string | null

  @Column({
    name: 'handle_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '处理时间'
  })
  handleAt!: Date | null

  @Column({
    name: 'handle_result',
    type: 'varchar',
    length: 2000,
    nullable: true,
    comment: '处理结果'
  })
  handleResult!: string | null

  @Column({
    name: 'arbitration_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '关联仲裁 ID（status=4）'
  })
  arbitrationId!: string | null
}
