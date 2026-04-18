/**
 * @file message.service.ts
 * @stage P3/T3.13 + P3-REVIEW-01 R1（I-01 修复）
 * @desc 消息推送 Service（4 通道路由 + 站内信 CRUD + processJob/markFinalFailed 完整实现）
 * @author 员工 A（接管 R1 修复，替换 P3 原 stub）
 *
 * 对齐 DESIGN_P3 §4.1 发送流程：
 *   业务调用 MessageService.send(opts)
 *     → 查 templateService.getRegistration(code) 拿默认通道集合（或 channelOverride）
 *     → 对每个通道：渲染 title/content + 写 push_record(status=0) + publish 到 RabbitMQ
 *     → Consumer 路由调 processJob → channel.send → 成功更新 push_record(status=2/sentAt)
 *     → 失败 < 3 次重试；≥ 3 次落死信 → markFinalFailed 写 push_record(status=3)
 *
 * 站内信 4 接口（被 inbox.controller 调用）：
 *   listInbox / unreadCount / markRead / markAllRead
 *   越权校验：markRead 必须 receiverId === currentUser.uid && receiverType 与 userType 匹配
 */

import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { randomUUID } from 'crypto'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '../../common'
import { MessageInbox, PushRecord } from '../../entities'
import { SnowflakeId } from '../../utils'
import {
  ALI_SMS_CHANNEL,
  INBOX_CHANNEL,
  JPUSH_CHANNEL,
  WX_SUBSCRIBE_CHANNEL,
  type ChannelSendPayload,
  type MessageChannel
} from './channels/message-channel.interface'
import type { MessagePushJob } from './consumer/message.consumer'
import { MessageConsumer } from './consumer/message.consumer'
import { TemplateService } from './template/template.service'
import { ChannelTypeName, MessageChannelType, TargetUserType } from './template/template-codes'

/* ============================================================
 * 类型定义
 * ============================================================ */

/** processJob 返回值（与 MessageConsumer 期望一致；务必保持兼容） */
export interface ProcessJobResult {
  ok: boolean
  errorCode?: string | null
  errorMsg?: string | null
}

/** 通道字面量（外部 API 暴露） */
export type ChannelName = 'WX_SUBSCRIBE' | 'JPUSH' | 'ALI_SMS' | 'INBOX'

/** 用户身份字面量（与 AuthUser.userType 对齐） */
export type UserTypeName = 'user' | 'merchant' | 'rider' | 'admin'

/** send() 入参 */
export interface SendMessageOpts {
  /** 模板 code，如 'ORDER_CREATED'（必须在 TEMPLATE_REGISTRATIONS 内） */
  code: string
  /** 目标端类型 1 用户 / 2 商户 / 3 骑手 / 4 管理员 */
  targetType: 1 | 2 | 3 | 4
  /** 目标主键（雪花字符串） */
  targetId: string
  /** 目标地址（openId / 手机号 / device_token；INBOX 通道可为空） */
  targetAddress?: string
  /** 模板变量字典；与 contentTemplate 占位符对应 */
  vars?: Record<string, string | number>
  /** 指定通道集合（不传则按模板默认 channels） */
  channelOverride?: ChannelName[]
  /** 业务关联（站内信详情跳转用） */
  category?: number
  relatedType?: number | null
  relatedNo?: string | null
  linkUrl?: string | null
  /** 业务可指定幂等 ID（同 ID 二次投递视为重复） */
  requestId?: string
}

/** 站内信查询入参 */
export interface ListInboxOpts {
  page?: number
  pageSize?: number
  /** 仅查未读 */
  onlyUnread?: boolean
}

/** 当前登录上下文（与 decorators/current-user.decorator.AuthUser 对齐） */
export interface CurrentUserCtx {
  uid: string
  userType: UserTypeName
}

/* ============================================================
 * MessageService
 * ============================================================ */

/** 通道字面量 → 数值枚举 */
const CHANNEL_NAME_TO_TYPE: Record<ChannelName, MessageChannelType> = {
  WX_SUBSCRIBE: MessageChannelType.WX_SUBSCRIBE,
  JPUSH: MessageChannelType.JPUSH,
  ALI_SMS: MessageChannelType.ALI_SMS,
  INBOX: MessageChannelType.INBOX
}

/** userType 字面量 → receiverType 数值（站内信 / push_record 共用） */
const USER_TYPE_TO_RECEIVER: Record<UserTypeName, number> = {
  user: TargetUserType.USER,
  merchant: TargetUserType.MERCHANT,
  rider: TargetUserType.RIDER,
  admin: TargetUserType.ADMIN
}

/**
 * 消息推送服务
 */
@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name)

  constructor(
    @Inject(WX_SUBSCRIBE_CHANNEL) private readonly wxChannel: MessageChannel,
    @Inject(JPUSH_CHANNEL) private readonly jpushChannel: MessageChannel,
    @Inject(ALI_SMS_CHANNEL) private readonly aliSmsChannel: MessageChannel,
    @Inject(INBOX_CHANNEL) private readonly inboxChannel: MessageChannel,
    @InjectRepository(PushRecord) private readonly pushRecordRepo: Repository<PushRecord>,
    @InjectRepository(MessageInbox) private readonly inboxRepo: Repository<MessageInbox>,
    private readonly templateService: TemplateService,
    @Inject(forwardRef(() => MessageConsumer))
    private readonly consumer: MessageConsumer
  ) {}

  /* ============================================================
   * 一、send —— 业务发送入口（异步走 MQ；in-memory 模式同步 fallback）
   * ============================================================ */

  /**
   * 发送消息（按模板默认通道 / 或指定通道集合）
   *
   * 流程：
   *   1) 取模板登记项（不存在 → 10010）
   *   2) 计算最终通道集合（channelOverride ∪ 模板默认 channels）
   *   3) 对每个通道：
   *      a. 渲染 title/content（模板可能 DB 内有定制；优先取 DB，回落 registration）
   *      b. 构造 ChannelSendPayload + MessagePushJob
   *      c. 写 push_record(status=0 待发送)
   *      d. publish 到 MessageConsumer（mock 模式同步 routing；真 MQ 异步）
   *
   * 参数：opts SendMessageOpts
   * 返回值：{ jobsCreated: 实际投递的通道数 }
   * 错误：模板不存在 / 通道集合为空 → BusinessException
   */
  async send(opts: SendMessageOpts): Promise<{ jobsCreated: number }> {
    if (!opts.code || !opts.targetId || !opts.targetType) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'code/targetType/targetId 不可为空')
    }
    const reg = this.templateService.getRegistration(opts.code)
    if (!reg) {
      throw new BusinessException(
        BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
        `模板 code=${opts.code} 未注册`
      )
    }

    /* 计算通道集合（去重）：override 优先，否则用模板默认 */
    const channels: MessageChannelType[] =
      opts.channelOverride && opts.channelOverride.length > 0
        ? Array.from(new Set(opts.channelOverride.map((n) => CHANNEL_NAME_TO_TYPE[n])))
        : Array.from(new Set(reg.channels))

    if (channels.length === 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '通道集合为空')
    }

    const baseRequestId = opts.requestId ?? randomUUID()
    const vars = (opts.vars ?? {}) as Record<string, unknown>
    let jobsCreated = 0

    for (const channel of channels) {
      /* 取 DB 模板（含 externalTemplateId）；缺则回落 registration 内容 */
      const dbTpl = await this.templateService.getTemplate(opts.code, channel).catch(() => null)
      const titleSrc = dbTpl?.titleTemplate ?? reg.titleTemplate ?? null
      const contentSrc = dbTpl?.contentTemplate ?? reg.contentTemplate
      const renderedTitle = titleSrc ? this.templateService.render(titleSrc, vars) : null
      const renderedContent = this.templateService.render(contentSrc, vars)

      /* SMS 通道需要 external_template_id 注入到 vars __externalTemplateId */
      const finalVars: Record<string, unknown> = { ...vars }
      if (channel === MessageChannelType.ALI_SMS && dbTpl?.externalTemplateId) {
        finalVars.__externalTemplateId = dbTpl.externalTemplateId
      }

      /* push_record 行（status=0 待发送）*/
      const requestId = `${baseRequestId}:${channel}` /* 多通道时用 channel 后缀避免 unique 冲突 */
      try {
        const recEntity = this.pushRecordRepo.create({
          id: SnowflakeId.next(),
          tenantId: 1,
          requestId,
          channel,
          provider: this.providerNameOf(channel),
          templateId: dbTpl?.id ?? null,
          templateCode: opts.code,
          targetType: opts.targetType,
          targetId: opts.targetId,
          targetAddress: opts.targetAddress ?? '',
          varsJson: finalVars as Record<string, unknown>,
          status: 0,
          attempts: 0,
          externalMsgId: null,
          errorCode: null,
          errorMsg: null,
          sentAt: null,
          isDeleted: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        })
        await this.pushRecordRepo.save(recEntity)
      } catch (err) {
        /* DB 未就绪不阻塞投递；仅 log 警告 */
        this.logger.warn(
          `[MSG] push_record 写入失败（DB 未就绪？）requestId=${requestId} err=${(err as Error).message}`
        )
      }

      const job: MessagePushJob = {
        requestId,
        templateCode: opts.code,
        templateId: dbTpl?.id ?? null,
        channel,
        targetType: opts.targetType,
        targetId: opts.targetId,
        targetAddress: opts.targetAddress ?? '',
        title: renderedTitle,
        content: renderedContent,
        vars: finalVars,
        category: opts.category,
        relatedType: opts.relatedType ?? null,
        relatedNo: opts.relatedNo ?? null,
        linkUrl: opts.linkUrl ?? null,
        attempts: 0
      }

      try {
        await this.consumer.publish(job)
        jobsCreated += 1
      } catch (err) {
        /* publish 失败时降级 in-memory 直接处理（与 consumer mock 模式一致） */
        this.logger.warn(
          `[MSG] publish 失败，降级直接 processJob：requestId=${requestId} err=${(err as Error).message}`
        )
        try {
          const result = await this.processJob(job)
          if (result.ok) jobsCreated += 1
          else {
            this.logger.warn(
              `[MSG] in-memory fallback processJob 失败 requestId=${requestId}` +
                ` code=${result.errorCode ?? '-'} msg=${result.errorMsg ?? '-'}`
            )
          }
        } catch (innerErr) {
          this.logger.error(
            `[MSG] in-memory fallback 异常 requestId=${requestId}：${(innerErr as Error).message}`
          )
        }
      }
    }
    return { jobsCreated }
  }

  /* ============================================================
   * 二、processJob —— 路由到对应 Channel + 写 push_record(status=2)
   * ============================================================ */

  /**
   * 处理一条消息推送任务
   * 参数：job MessagePushJob（由 Consumer 解 MQ 消息后传入）
   * 返回值：ProcessJobResult { ok, errorCode?, errorMsg? }
   * 用途：被 MessageConsumer.handleMessage 调用
   */
  async processJob(job: MessagePushJob): Promise<ProcessJobResult> {
    const channel = this.routeChannel(job.channel)
    if (!channel) {
      return { ok: false, errorCode: 'CHANNEL_NOT_FOUND', errorMsg: `未知通道 ${job.channel}` }
    }

    const payload: ChannelSendPayload = {
      requestId: job.requestId,
      templateCode: job.templateCode,
      templateId: job.templateId,
      channel: job.channel as MessageChannelType,
      targetType: job.targetType,
      targetId: job.targetId,
      targetAddress: job.targetAddress,
      title: job.title,
      content: job.content,
      vars: job.vars,
      category: job.category,
      relatedType: job.relatedType,
      relatedNo: job.relatedNo,
      linkUrl: job.linkUrl
    }

    const sendResult = await channel.send(payload)

    /* 更新 push_record（按 requestId 唯一） */
    try {
      const rec = await this.pushRecordRepo.findOne({ where: { requestId: job.requestId } })
      if (rec) {
        if (sendResult.ok) {
          rec.status = 2 /* 2 = 已发送 */
          rec.externalMsgId = sendResult.externalMsgId ?? null
          rec.sentAt = new Date()
          rec.attempts = (rec.attempts ?? 0) + 1
          rec.errorCode = null
          rec.errorMsg = null
        } else {
          rec.status = 1 /* 1 = 发送中（重试中），由 markFinalFailed 在终态再置 3 */
          rec.attempts = (rec.attempts ?? 0) + 1
          rec.errorCode = sendResult.errorCode ?? null
          rec.errorMsg = sendResult.errorMsg ?? null
        }
        rec.updatedAt = new Date()
        await this.pushRecordRepo.save(rec)
      }
    } catch (err) {
      /* DB 写入失败不影响 MQ 重试链路 */
      this.logger.warn(
        `[MSG] push_record 更新失败 requestId=${job.requestId}：${(err as Error).message}`
      )
    }

    return {
      ok: sendResult.ok,
      errorCode: sendResult.errorCode ?? null,
      errorMsg: sendResult.errorMsg ?? null
    }
  }

  /* ============================================================
   * 三、markFinalFailed —— 写 push_record(status=3 终态失败)
   * ============================================================ */

  /**
   * 标记任务为终态失败（≥ 3 次重试仍失败 → 死信）
   * 参数：job / errorCode / errorMsg（可空）
   * 返回值：Promise<void>
   * 用途：被 MessageConsumer.routeFailure 在 attempts ≥ MAX_ATTEMPTS 时调用
   */
  async markFinalFailed(
    job: MessagePushJob,
    errorCode: string | null | undefined,
    errorMsg: string | null | undefined
  ): Promise<void> {
    try {
      const rec = await this.pushRecordRepo.findOne({ where: { requestId: job.requestId } })
      if (rec) {
        rec.status = 3 /* 3 = 失败终态 */
        rec.attempts = job.attempts ?? rec.attempts
        rec.errorCode = errorCode ?? rec.errorCode
        rec.errorMsg = errorMsg ?? rec.errorMsg
        rec.updatedAt = new Date()
        await this.pushRecordRepo.save(rec)
      }
    } catch (err) {
      this.logger.warn(
        `[MSG] markFinalFailed 写库失败 requestId=${job.requestId}：${(err as Error).message}`
      )
    }
    this.logger.warn(
      `[MSG-FAIL] tpl=${job.templateCode} ch=${ChannelTypeName[job.channel as MessageChannelType] ?? job.channel}` +
        ` to=${job.targetType}#${job.targetId} code=${errorCode ?? '-'} msg=${errorMsg ?? '-'}`
    )
  }

  /* ============================================================
   * 四、站内信 CRUD（被 inbox.controller 调用）
   * ============================================================ */

  /**
   * 列出当前用户站内信（按 created_at DESC + 未读优先）
   * 参数：receiverType 1/2/3/4；receiverId 主键；opts 分页 + onlyUnread
   * 返回值：PageResult<MessageInbox>
   * 用途：GET /api/v1/me/messages
   */
  async listInbox(
    receiverType: 1 | 2 | 3 | 4,
    receiverId: string,
    opts: ListInboxOpts
  ): Promise<PageResult<MessageInbox>> {
    const page = opts.page && opts.page > 0 ? opts.page : 1
    const pageSize = opts.pageSize && opts.pageSize > 0 && opts.pageSize <= 100 ? opts.pageSize : 10

    const qb = this.inboxRepo
      .createQueryBuilder('m')
      .where('m.receiver_type = :rt AND m.receiver_id = :rid AND m.is_deleted = 0', {
        rt: receiverType,
        rid: receiverId
      })
    if (opts.onlyUnread) {
      qb.andWhere('m.is_read = 0')
    }
    const total = await qb.getCount()
    const rows = await qb
      .orderBy('m.is_read', 'ASC') /* 0 未读优先 */
      .addOrderBy('m.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany()
    return makePageResult(rows, total, page, pageSize)
  }

  /**
   * 当前用户/商户/骑手 未读数
   * 参数：receiverType / receiverId
   * 返回值：number
   * 用途：GET /api/v1/me/messages/unread-count
   */
  async unreadCount(receiverType: number, receiverId: string): Promise<number> {
    return this.inboxRepo.count({
      where: { receiverType, receiverId, isRead: 0, isDeleted: 0 }
    })
  }

  /**
   * 标已读（含越权校验）
   * 参数：id 站内信 id；currentUser 当前登录上下文
   * 返回值：MessageInbox（已读后的实体）
   * 错误：
   *   - 不存在或已软删 → 10010 BIZ_RESOURCE_NOT_FOUND
   *   - 接收者类型与登录端不匹配 / receiverId 与 uid 不一致 → 20003 AUTH_PERMISSION_DENIED
   * 用途：PUT /api/v1/me/messages/:id/read
   */
  async markRead(id: string, currentUser: CurrentUserCtx): Promise<MessageInbox> {
    const m = await this.inboxRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!m) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '站内信不存在')
    }
    /* 越权校验：必须 receiverType 与 userType 匹配 + receiverId 与 uid 一致 */
    const expectedReceiver = USER_TYPE_TO_RECEIVER[currentUser.userType]
    if (m.receiverType !== expectedReceiver || m.receiverId !== currentUser.uid) {
      throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, '无权读取他人消息')
    }
    if (m.isRead === 0) {
      m.isRead = 1
      m.readAt = new Date()
      m.updatedAt = new Date()
      await this.inboxRepo.save(m)
    }
    return m
  }

  /**
   * 全部标已读
   * 参数：receiverType / receiverId
   * 返回值：{ updated: 影响行数 }
   * 用途：PUT /api/v1/me/messages/read-all
   */
  async markAllRead(receiverType: number, receiverId: string): Promise<{ updated: number }> {
    const result = await this.inboxRepo
      .createQueryBuilder()
      .update(MessageInbox)
      .set({ isRead: 1, readAt: new Date(), updatedAt: new Date() })
      .where('receiver_type = :rt AND receiver_id = :rid AND is_read = 0 AND is_deleted = 0', {
        rt: receiverType,
        rid: receiverId
      })
      .execute()
    return { updated: result.affected ?? 0 }
  }

  /* ============================================================
   * 内部工具
   * ============================================================ */

  /**
   * 通道枚举 → 对应 Channel 实例
   */
  private routeChannel(ch: number): MessageChannel | null {
    switch (ch) {
      case MessageChannelType.WX_SUBSCRIBE:
        return this.wxChannel
      case MessageChannelType.JPUSH:
        return this.jpushChannel
      case MessageChannelType.ALI_SMS:
        return this.aliSmsChannel
      case MessageChannelType.INBOX:
        return this.inboxChannel
      default:
        return null
    }
  }

  /**
   * 通道 → provider 字符串（落 push_record.provider 列）
   */
  private providerNameOf(ch: MessageChannelType): string {
    switch (ch) {
      case MessageChannelType.WX_SUBSCRIBE:
        return 'wechat-mp'
      case MessageChannelType.JPUSH:
        return 'jpush'
      case MessageChannelType.ALI_SMS:
        return 'ali-sms'
      case MessageChannelType.INBOX:
        return 'inbox'
      default:
        return 'unknown'
    }
  }

  /**
   * 暴露给外部的 userType → receiverType 映射（inbox.controller 也需用）
   * 参数：userType 'user'|'merchant'|'rider'|'admin'
   * 返回值：1|2|3|4
   */
  static userTypeToReceiver(userType: UserTypeName): 1 | 2 | 3 | 4 {
    return USER_TYPE_TO_RECEIVER[userType] as 1 | 2 | 3 | 4
  }
}
