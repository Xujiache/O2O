/**
 * @file inbox.channel.ts
 * @stage P3 / T3.15
 * @desc 站内信通道：直写 message_inbox 表
 * @author 员工 B
 *
 * 实现：直接写 message_inbox（is_read=0），不走第三方
 * 失败仅记录 logger.error，向 Consumer 返回 ok=false 让其进重试
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MessageInbox } from '../../../entities'
import { SnowflakeId } from '../../../utils'
import { MessageChannelType } from '../template/template-codes'
import { ChannelSendPayload, ChannelSendResult, MessageChannel } from './message-channel.interface'

@Injectable()
export class InboxChannel implements MessageChannel {
  readonly type = MessageChannelType.INBOX
  private readonly logger = new Logger(InboxChannel.name)

  constructor(
    @InjectRepository(MessageInbox)
    private readonly inboxRepo: Repository<MessageInbox>
  ) {}

  /**
   * 写一条站内信
   * 参数：payload
   * 返回值：ChannelSendResult（externalMsgId 复用站内信主键）
   */
  async send(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    try {
      const e = this.inboxRepo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        receiverType: payload.targetType,
        receiverId: payload.targetId,
        category: payload.category ?? 4, // 默认 4=系统消息
        title: payload.title ?? '',
        content: payload.content,
        linkUrl: payload.linkUrl ?? null,
        relatedType: payload.relatedType ?? null,
        relatedNo: payload.relatedNo ?? null,
        isRead: 0,
        readAt: null,
        templateId: payload.templateId,
        isDeleted: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      })
      await this.inboxRepo.save(e)
      this.logger.log(
        `[INBOX] 写入站内信 receiver=${payload.targetType}:${payload.targetId} code=${payload.templateCode}`
      )
      return { ok: true, externalMsgId: e.id, mock: false }
    } catch (err) {
      this.logger.error(
        `[INBOX] 写入失败 code=${payload.templateCode} err=${(err as Error).message}`
      )
      return {
        ok: false,
        errorCode: 'INBOX_WRITE_FAILED',
        errorMsg: (err as Error).message
      }
    }
  }
}
