/**
 * @file arbitration.entity.ts
 * @stage P4/T4.47（Sprint 7）
 * @desc TypeORM Entity：D8.5 arbitration —— 平台仲裁（对齐 08_review.sql）
 * @author 单 Agent V2.0
 *
 * source_type：1 售后转仲裁 / 2 投诉转仲裁 / 3 主动申请
 * decision：1 申请方胜 / 2 被申请方胜 / 3 部分支持 / 4 驳回
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 平台仲裁
 */
@Entity({ name: 'arbitration' })
@Index('uk_arbitration_no', ['arbitrationNo'], { unique: true })
@Index('idx_status_created', ['status', 'createdAt'])
@Index('idx_order_no', ['orderNo'])
@Index('idx_applicant', ['applicantType', 'applicantId', 'status'])
@Index('idx_respondent', ['respondentType', 'respondentId', 'status'])
export class Arbitration extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'arbitration_no', type: 'varchar', length: 32, comment: '仲裁单号' })
  arbitrationNo!: string

  @Column({
    name: 'source_type',
    type: 'tinyint',
    unsigned: true,
    comment: '来源：1 售后转 / 2 投诉转 / 3 主动申请'
  })
  sourceType!: number

  @Column({ name: 'source_id', type: 'bigint', unsigned: true, comment: '来源 ID' })
  sourceId!: string

  @Column({ name: 'order_no', type: 'char', length: 18, comment: '关联订单号' })
  orderNo!: string

  @Column({
    name: 'order_type',
    type: 'tinyint',
    unsigned: true,
    comment: '订单类型：1 外卖 / 2 跑腿'
  })
  orderType!: number

  @Column({
    name: 'applicant_type',
    type: 'tinyint',
    unsigned: true,
    comment: '申请方：1 用户 / 2 商户 / 3 骑手'
  })
  applicantType!: number

  @Column({ name: 'applicant_id', type: 'bigint', unsigned: true, comment: '申请方 ID' })
  applicantId!: string

  @Column({
    name: 'respondent_type',
    type: 'tinyint',
    unsigned: true,
    comment: '被申请方：1 用户 / 2 商户 / 3 骑手'
  })
  respondentType!: number

  @Column({ name: 'respondent_id', type: 'bigint', unsigned: true, comment: '被申请方 ID' })
  respondentId!: string

  @Column({
    name: 'dispute_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    comment: '争议金额'
  })
  disputeAmount!: string | null

  @Column({ name: 'dispute_content', type: 'varchar', length: 2000, comment: '争议描述' })
  disputeContent!: string

  @Column({
    name: 'evidence_urls',
    type: 'json',
    nullable: true,
    comment: '证据 URL 数组'
  })
  evidenceUrls!: string[] | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 待审 / 1 审理中 / 2 已裁决 / 3 已关闭'
  })
  status!: number

  @Column({
    name: 'decision',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '裁决结果：1 申请方胜 / 2 被申请方胜 / 3 部分支持 / 4 驳回'
  })
  decision!: number | null

  @Column({
    name: 'decision_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    comment: '裁决金额（赔付）'
  })
  decisionAmount!: string | null

  @Column({
    name: 'decision_detail',
    type: 'varchar',
    length: 2000,
    nullable: true,
    comment: '裁决详情'
  })
  decisionDetail!: string | null

  @Column({
    name: 'judge_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '主审管理员 ID'
  })
  judgeAdminId!: string | null

  @Column({
    name: 'decision_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '裁决时间'
  })
  decisionAt!: Date | null
}
