/**
 * @file push-record.entity.ts
 * @stage P3 / T3.13
 * @desc D9.3 push_record —— 外部推送记录（对齐 09_message.sql 第 3 张表）
 * @author 员工 B
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

@Entity({ name: 'push_record' })
@Index('uk_request_id', ['requestId'], { unique: true })
@Index('idx_target_status_created', ['targetType', 'targetId', 'status', 'createdAt'])
@Index('idx_status_attempts_created', ['status', 'attempts', 'createdAt'])
@Index('idx_channel_provider_status', ['channel', 'provider', 'status'])
export class PushRecord extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true })
  id!: string

  @Column({ name: 'request_id', type: 'varchar', length: 64 })
  requestId!: string

  @Column({ name: 'channel', type: 'tinyint', unsigned: true })
  channel!: number

  @Column({ name: 'provider', type: 'varchar', length: 32 })
  provider!: string

  @Column({ name: 'template_id', type: 'bigint', unsigned: true, nullable: true })
  templateId!: string | null

  @Column({ name: 'template_code', type: 'varchar', length: 64, nullable: true })
  templateCode!: string | null

  @Column({ name: 'target_type', type: 'tinyint', unsigned: true })
  targetType!: number

  @Column({ name: 'target_id', type: 'bigint', unsigned: true })
  targetId!: string

  @Column({ name: 'target_address', type: 'varchar', length: 255 })
  targetAddress!: string

  @Column({ name: 'vars_json', type: 'json', nullable: true })
  varsJson!: Record<string, unknown> | null

  @Column({ name: 'status', type: 'tinyint', unsigned: true, default: 0 })
  status!: number

  @Column({ name: 'attempts', type: 'tinyint', unsigned: true, default: 0 })
  attempts!: number

  @Column({ name: 'external_msg_id', type: 'varchar', length: 128, nullable: true })
  externalMsgId!: string | null

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null

  @Column({ name: 'error_msg', type: 'varchar', length: 500, nullable: true })
  errorMsg!: string | null

  @Column({ name: 'sent_at', type: 'datetime', precision: 3, nullable: true })
  sentAt!: Date | null
}
