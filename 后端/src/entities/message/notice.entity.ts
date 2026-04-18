/**
 * @file notice.entity.ts
 * @stage P3 / T3.13
 * @desc D9.4 notice —— 平台公告/通知（对齐 09_message.sql 第 4 张表）
 * @author 员工 B
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

@Entity({ name: 'notice' })
@Index('uk_notice_no', ['noticeNo'], { unique: true })
@Index('idx_status_start_end', ['status', 'startAt', 'endAt'])
@Index('idx_priority_published', ['priority', 'publishedAt'])
export class Notice extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true })
  id!: string

  @Column({ name: 'notice_no', type: 'varchar', length: 32 })
  noticeNo!: string

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string

  @Column({ name: 'summary', type: 'varchar', length: 500, nullable: true })
  summary!: string | null

  @Column({ name: 'content', type: 'text' })
  content!: string

  @Column({ name: 'cover_url', type: 'varchar', length: 512, nullable: true })
  coverUrl!: string | null

  @Column({ name: 'notice_type', type: 'tinyint', unsigned: true })
  noticeType!: number

  @Column({ name: 'target_terminal', type: 'json' })
  targetTerminal!: string[]

  @Column({ name: 'target_city', type: 'json', nullable: true })
  targetCity!: string[] | null

  @Column({ name: 'target_user_segment', type: 'json', nullable: true })
  targetUserSegment!: string[] | null

  @Column({ name: 'priority', type: 'tinyint', unsigned: true, default: 1 })
  priority!: number

  @Column({ name: 'start_at', type: 'datetime', precision: 3 })
  startAt!: Date

  @Column({ name: 'end_at', type: 'datetime', precision: 3 })
  endAt!: Date

  @Column({ name: 'view_count', type: 'int', unsigned: true, default: 0 })
  viewCount!: number

  @Column({ name: 'status', type: 'tinyint', unsigned: true, default: 0 })
  status!: number

  @Column({
    name: 'publisher_admin_id',
    type: 'bigint',
    unsigned: true,
    nullable: true
  })
  publisherAdminId!: string | null

  @Column({ name: 'published_at', type: 'datetime', precision: 3, nullable: true })
  publishedAt!: Date | null
}
