/**
 * @file review-appeal.entity.ts
 * @stage P4/T4.45（Sprint 7）
 * @desc TypeORM Entity：D8.3 review_appeal —— 评价申诉（对齐 08_review.sql）
 * @author 单 Agent V2.0
 *
 * appellant_type：1 商户 / 2 骑手
 * status：0 申诉中 / 1 通过(评价已隐藏) / 2 驳回
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 评价申诉
 */
@Entity({ name: 'review_appeal' })
@Index('idx_review_id', ['reviewId'])
@Index('idx_appellant_status', ['appellantType', 'appellantId', 'status'])
@Index('idx_status_created', ['status', 'createdAt'])
export class ReviewAppeal extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'review_id', type: 'bigint', unsigned: true, comment: '被申诉评价 ID' })
  reviewId!: string

  @Column({
    name: 'appellant_type',
    type: 'tinyint',
    unsigned: true,
    comment: '申诉方：1 商户 / 2 骑手'
  })
  appellantType!: number

  @Column({ name: 'appellant_id', type: 'bigint', unsigned: true, comment: '申诉方 ID' })
  appellantId!: string

  @Column({ name: 'reason_code', type: 'varchar', length: 64, comment: '申诉理由编码' })
  reasonCode!: string

  @Column({ name: 'reason_detail', type: 'varchar', length: 1000, comment: '申诉详情' })
  reasonDetail!: string

  @Column({
    name: 'evidence_urls',
    type: 'json',
    nullable: true,
    comment: '证据图片 URL 数组'
  })
  evidenceUrls!: string[] | null

  @Column({
    name: 'status',
    type: 'tinyint',
    unsigned: true,
    default: 0,
    comment: '状态：0 申诉中 / 1 通过 / 2 驳回'
  })
  status!: number

  @Column({
    name: 'audit_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: '审核管理员'
  })
  auditAdminId!: string | null

  @Column({
    name: 'audit_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    comment: '审核时间'
  })
  auditAt!: Date | null

  @Column({
    name: 'audit_remark',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '审核备注'
  })
  auditRemark!: string | null
}
