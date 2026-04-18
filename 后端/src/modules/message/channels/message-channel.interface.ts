/**
 * @file message-channel.interface.ts
 * @stage P3 / T3.13
 * @desc 4 个消息通道（WxSubscribe/JPush/AliSms/Inbox）的统一抽象接口
 * @author 员工 B
 *
 * Channel 实现要点：
 *   - 任一通道在 env 配置缺失时进入 mock 模式（日志输出 + 返回 ok=true，禁止抛异常）
 *   - 真实调用失败必须返回 ok=false 并附 errorCode/errorMsg；不允许 throw（让 Consumer 决定重试）
 */

import { MessageChannelType } from '../template/template-codes'
import type { MessageInbox, PushRecord } from '../../../entities'

/**
 * 通道入参
 * 用途：MessageService 投递 / Consumer 调度时构造
 */
export interface ChannelSendPayload {
  /** 业务请求幂等 ID（写入 push_record.request_id 唯一） */
  requestId: string
  /** 业务模板编码（用于日志/落库） */
  templateCode: string
  /** 模板 ID（DB 内 message_template.id） */
  templateId: string | null
  /** 通道类型（数值） */
  channel: MessageChannelType
  /** 目标用户类型 1/2/3 */
  targetType: number
  /** 目标用户 ID（雪花字符串） */
  targetId: string
  /**
   * 目标地址：
   *   - WxSubscribe: openid
   *   - JPush: alias / registrationId
   *   - AliSms: 11 位手机号（明文；SmsChannel 内自行 hash 频控）
   *   - Inbox: 收件人 ID（与 targetId 等价；channel 不强制使用）
   */
  targetAddress: string
  /** 渲染后的标题（可空） */
  title: string | null
  /** 渲染后的内容 */
  content: string
  /** 模板变量字典（用于落 push_record.vars_json + WxSubscribe data 字段） */
  vars: Record<string, unknown>
  /** 业务关联：用于站内信详情跳转 */
  category?: number
  relatedType?: number | null
  relatedNo?: string | null
  linkUrl?: string | null
}

/**
 * 通道发送结果
 */
export interface ChannelSendResult {
  ok: boolean
  /** 服务商返回消息 ID（成功时填） */
  externalMsgId?: string | null
  /** 错误码（失败时填，如 wechat 47001 / aliyun isv.MOBILE_NUMBER_ILLEGAL） */
  errorCode?: string | null
  /** 错误描述 */
  errorMsg?: string | null
  /** 是否 mock 模式（日志/审计标识） */
  mock?: boolean
}

/**
 * 通道统一抽象
 */
export interface MessageChannel {
  readonly type: MessageChannelType
  send(payload: ChannelSendPayload): Promise<ChannelSendResult>
}

/**
 * 内部使用：用于把 inbox / push_record 实体回传给 MessageService 写库
 * （Channel 自身不负责持久化；统一由 MessageService 在 Consumer 内做 push_record 写入）
 */
export type ChannelOutboundEntity = PushRecord | MessageInbox

/* ============================================================
 * P3-REVIEW-01 R1（I-01）：4 个 Channel 注入 Token
 * ============================================================
 * 用途：MessageService 通过 `@Inject(WX_SUBSCRIBE_CHANNEL) wx: MessageChannel` 注入；
 *       message.module.ts 用 `useExisting` 把具体 Class 绑定到 token。
 * 设计原因：
 *   - 让 MessageService 仅依赖 MessageChannel 抽象，不绑定具体 Class，便于单测 mock；
 *   - Symbol 比字符串更安全，避免 token 撞名；
 *   - 4 个 token 与 MessageChannelType 一一对应，命名 W X _SUBSCRIBE / JPUSH / ALI_SMS / INBOX。
 */
export const WX_SUBSCRIBE_CHANNEL = Symbol('WX_SUBSCRIBE_CHANNEL')
export const JPUSH_CHANNEL = Symbol('JPUSH_CHANNEL')
export const ALI_SMS_CHANNEL = Symbol('ALI_SMS_CHANNEL')
export const INBOX_CHANNEL = Symbol('INBOX_CHANNEL')
