/**
 * @file message-inbox.entity.ts
 * @stage P3 / T3.13
 * @desc D9.2 message_inbox —— 站内信收件箱（对齐 09_message.sql 第 2 张表）
 * @author 员工 B
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

@Entity({ name: 'message_inbox' })
@Index('idx_receiver_read_created', ['receiverType', 'receiverId', 'isRead', 'createdAt'])
@Index('idx_receiver_category', ['receiverType', 'receiverId', 'category', 'createdAt'])
@Index('idx_related_no', ['relatedNo'])
export class MessageInbox extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true })
  id!: string

  @Column({ name: 'receiver_type', type: 'tinyint', unsigned: true })
  receiverType!: number

  @Column({ name: 'receiver_id', type: 'bigint', unsigned: true })
  receiverId!: string

  @Column({ name: 'category', type: 'tinyint', unsigned: true })
  category!: number

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string

  @Column({ name: 'content', type: 'text' })
  content!: string

  @Column({ name: 'link_url', type: 'varchar', length: 512, nullable: true })
  linkUrl!: string | null

  @Column({ name: 'related_type', type: 'tinyint', unsigned: true, nullable: true })
  relatedType!: number | null

  @Column({ name: 'related_no', type: 'varchar', length: 64, nullable: true })
  relatedNo!: string | null

  @Column({ name: 'is_read', type: 'tinyint', unsigned: true, default: 0 })
  isRead!: number

  @Column({ name: 'read_at', type: 'datetime', precision: 3, nullable: true })
  readAt!: Date | null

  @Column({ name: 'template_id', type: 'bigint', unsigned: true, nullable: true })
  templateId!: string | null
}
