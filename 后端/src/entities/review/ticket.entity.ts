/**
 * @file ticket.entity.ts
 * @stage P4/T4.46（Sprint 7）
 * @desc TypeORM Entity：D8.6 ticket —— 客服工单（对齐 08_review.sql）
 * @author 单 Agent V2.0
 *
 * priority：1 低 / 2 中 / 3 高 / 4 紧急
 * status：0 待受理 / 1 处理中 / 2 已解决 / 3 已关闭 / 4 已转单
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 客服工单
 */
@Entity({ name: 'ticket' })
@Index('uk_ticket_no', ['ticketNo'], { unique: true })
@Index('idx_submitter_status_created', ['submitterType', 'submitterId', 'status', 'createdAt'])
@Index('idx_assignee_status', ['assigneeAdminId', 'status', 'priority'])
@Index('idx_status_priority_created', ['status', 'priority', 'createdAt'])
@Index('idx_related_order', ['relatedOrderNo'])
export class Ticket extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'ticket_no', type: 'varchar', length: 32, comment: '工单号' })
  ticketNo!: string

  @Column({
    name: 'submitter_type',
    type: 'tinyint',
    unsigned: true,
    comment: '提交方：1 用户 / 2 商户 / 3 骑手'
  })
  submitterType!: number

  @Column({ name: 'submitter_id', type: 'bigint', unsigned: true, comment: '提交方 ID' })
  submitterId!: string

  @Column({ name: 'category', type: 'varchar', length: 64, comment: '工单分类' })
  category!: string

  @Column({
    name: 'priority',
    type: 'tinyint',
    unsigned: true,
    default: 1,
    comment: '优先级：1 低 / 2 中 / 3 高 / 4 紧急'
  })
  priority!: number

  @Column({ name: 'title', type: 'varchar', length: 255, comment: '工单标题' })
  title!: string

  @Column({ name: 'content', type: 'text', comment: '工单内容' })
  content!: string

  @Column({
    name: 'attach_urls',
    type: 'json',
    nullable: true,
    comment: '附件 URL 数组'
  })
  attachUrls!: string[] | null

  @Column({
    name: 'related_order_no',
    type: 'char',
    length: 18,
    nullable: true,
    comment: '关联订单号'
  })
  relatedOrderNo!: string | null

  @Column({
    name: 'related_type',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '关联类型：1 外卖 / 2 跑腿'
  })
  relatedType!: number | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 待受理 / 1 处理中 / 2 已解决 / 3 已关闭 / 4 已转单'
  })
  status!: number

  @Column({
    name: 'assignee_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '指派管理员 ID'
  })
  assigneeAdminId!: string | null

  @Column({
    name: 'last_reply_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '最后回复时间'
  })
  lastReplyAt!: Date | null

  @Column({
    name: 'last_reply_by_type',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '最后回复方：1 提交方 / 2 客服'
  })
  lastReplyByType!: number | null

  @Column({
    name: 'closed_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '关闭时间'
  })
  closedAt!: Date | null

  @Column({
    name: 'close_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '关闭原因/总结'
  })
  closeReason!: string | null
}
