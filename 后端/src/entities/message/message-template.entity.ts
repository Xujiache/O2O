/**
 * @file message-template.entity.ts
 * @stage P3 / T3.13
 * @desc D9.1 message_template —— 消息/订阅消息模板（对齐 09_message.sql 第 1 张表）
 * @author 员工 B
 *
 * 通道：1 站内信 / 2 微信小程序订阅 / 3 短信 / 4 APP 推送
 * 目标用户：1 用户 / 2 商户 / 3 骑手 / 4 管理员
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { BaseEntity } from '../base.entity'

@Entity({ name: 'message_template' })
@Index('uk_template_code', ['templateCode'], { unique: true })
@Index('idx_channel_scene_status', ['channel', 'bizScene', 'status'])
export class MessageTemplate extends BaseEntity {
  @PrimaryColumn({ name: 'id', type: 'bigint', unsigned: true })
  id!: string

  @Column({ name: 'template_code', type: 'varchar', length: 64 })
  templateCode!: string

  @Column({ name: 'template_name', type: 'varchar', length: 128 })
  templateName!: string

  @Column({ name: 'channel', type: 'tinyint', unsigned: true })
  channel!: number

  @Column({ name: 'target_type', type: 'tinyint', unsigned: true })
  targetType!: number

  @Column({ name: 'biz_scene', type: 'varchar', length: 64 })
  bizScene!: string

  @Column({
    name: 'external_template_id',
    type: 'varchar',
    length: 128,
    nullable: true
  })
  externalTemplateId!: string | null

  @Column({ name: 'title_template', type: 'varchar', length: 255, nullable: true })
  titleTemplate!: string | null

  @Column({ name: 'content_template', type: 'text' })
  contentTemplate!: string

  @Column({ name: 'var_schema', type: 'json', nullable: true })
  varSchema!: Record<string, unknown> | null

  @Column({ name: 'priority', type: 'tinyint', unsigned: true, default: 1 })
  priority!: number

  @Column({ name: 'status', type: 'tinyint', unsigned: true, default: 1 })
  status!: number
}
