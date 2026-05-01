/**
 * @file notification.types.ts
 * @stage P9/W5.B (Sprint 5) — 通知统一类型
 * @desc Sprint 5 引入 NotificationModule 作为多通道（jpush / sms / wx-subscribe / axn）统一入口。
 *
 *   本文件只定义共享类型，不引入任何 runtime 依赖。
 *
 * @author Agent B (P9 Sprint 5)
 */

/**
 * 通知通道枚举（字符串字面量）
 *  - jpush         极光 APP 推送
 *  - sms           短信（阿里云 / 腾讯云，由 C 实现）
 *  - wx-subscribe  微信小程序订阅消息（由 E 实现）
 *  - axn           运营商 AXN 隐私号呼叫（由 E 实现）
 */
export type Channel = 'jpush' | 'sms' | 'wx-subscribe' | 'axn'

/**
 * JPush 受众目标（4 选 1）
 *   - regId  按设备 registration_id 推送（最精准）
 *   - alias  按业务别名推送（一般为 userId）
 *   - tag    按标签推送（如骑手 / 商户分组）
 *   - all    全员
 */
export type PushTargetKind = 'regId' | 'alias' | 'tag' | 'all'

/**
 * JPush 受众结构
 *   kind=all 时无 values
 *   其它取 string[]
 */
export interface PushTarget {
  kind: PushTargetKind
  values?: string[]
}

/**
 * 统一推送 payload（NotificationService.send 入参）
 *
 * 字段：
 *   - channel  通道
 *   - title    标题（部分通道不展示，例如 sms 则 title 仅作模板上下文）
 *   - content  正文
 *   - extras   附加数据（如 orderNo / type，前端用于路由跳转）
 *   - target   目标（仅 jpush 必填；其它通道由具体 provider 自行解释）
 *   - templateCode 模板编码（sms / wx-subscribe 必填；jpush 可忽略）
 *   - templateVars 模板变量（同上）
 *   - phone    手机号（sms / axn 必填）
 *   - phonePeer 对端手机号（axn 必填）
 *   - openId   微信 openId（wx-subscribe 必填）
 */
export interface PushPayload {
  channel: Channel
  title: string
  content: string
  extras?: Record<string, unknown>
  target?: PushTarget
  templateCode?: string
  templateVars?: Record<string, string>
  phone?: string
  phonePeer?: string
  openId?: string
}

/**
 * 统一返回（NotificationService / 各 Provider 共享）
 *  - ok       是否成功（best-effort：失败不抛错，仅返回 ok=false）
 *  - msgId    服务方消息 id（jpush.msg_id / sms bizId / 订阅消息 msgid 等，可空）
 *  - sendNo   服务方批次号（jpush.sendno；其它通道留空）
 *  - reason   失败原因（如 'disabled' / 'http_4xx' / 'network_error'）
 *  - raw      服务方原始响应（用于审计 / 回放，可空）
 */
export interface PushResult {
  ok: boolean
  msgId?: string
  sendNo?: string
  reason?: string
  raw?: unknown
}
