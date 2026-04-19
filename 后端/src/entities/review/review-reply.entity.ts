/**
 * @file review-reply.entity.ts
 * @stage P4/T4.44（Sprint 7）
 * @desc TypeORM Entity：D8.2 review_reply —— 评价回复（对齐 08_review.sql）
 * @author 单 Agent V2.0
 *
 * replier_type：1 商户 / 2 平台官方
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

/**
 * 评价回复
 */
@Entity({ name: 'review_reply' })
@Index('idx_review_id', ['reviewId', 'createdAt'])
export class ReviewReply extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true, comment: '主键，雪花 ID' })
  id!: string

  @Column({ name: 'review_id', type: 'bigint', unsigned: true, comment: '原评价 ID' })
  reviewId!: string

  @Column({
    name: 'replier_type',
    type: 'tinyint',
    unsigned: true,
    comment: '回复方：1 商户 / 2 平台官方'
  })
  replierType!: number

  @Column({ name: 'replier_id', type: 'bigint', unsigned: true, comment: '回复方 ID' })
  replierId!: string

  @Column({ name: 'content', type: 'varchar', length: 1000, comment: '回复内容' })
  content!: string

  @Column({ name: 'is_hidden', type: 'tinyint', unsigned: true, default: 0, comment: '是否隐藏' })
  isHidden!: number
}
