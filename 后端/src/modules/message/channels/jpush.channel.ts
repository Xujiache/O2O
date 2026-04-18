/**
 * @file jpush.channel.ts
 * @stage P3 / T3.15
 * @desc 极光（JPush）APP 推送通道：HTTPS Basic Auth；alias / registrationId 双投递
 * @author 员工 B
 *
 * Mock 模式：当 JPUSH_APP_KEY 或 JPUSH_MASTER_SECRET 缺失时打日志返回 ok=true
 *
 * 极光 v3 接口：POST https://api.jpush.cn/v3/push
 *   Authorization: Basic base64(appKey:masterSecret)
 *   Body: { platform: 'all', audience: { alias|registration_id: [...] }, notification: { alert, android, ios } }
 *
 * 触达策略：
 *   - targetAddress 为纯数字 7+ 位 → 视为 registrationId
 *   - 否则视为 alias
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MessageChannelType } from '../template/template-codes'
import { ChannelSendPayload, ChannelSendResult, MessageChannel } from './message-channel.interface'

const JPUSH_API = 'https://api.jpush.cn/v3/push'

interface JPushSendResp {
  sendno?: string
  msg_id?: string
  error?: { code: number; message: string }
}

@Injectable()
export class JPushChannel implements MessageChannel {
  readonly type = MessageChannelType.JPUSH
  private readonly logger = new Logger(JPushChannel.name)

  private readonly appKey: string
  private readonly masterSecret: string

  constructor(private readonly configService: ConfigService) {
    // 这两个 env key 在 P9 阶段加入 Joi schema 后正式落库；本期从环境变量直读
    this.appKey = process.env.JPUSH_APP_KEY ?? ''
    this.masterSecret = process.env.JPUSH_MASTER_SECRET ?? ''
    // 静默 configService 暂未直接使用警告
    void this.configService
  }

  /**
   * 是否处于 mock 模式
   */
  private isMockMode(): boolean {
    return !this.appKey || !this.masterSecret
  }

  /**
   * 推送
   * 参数：payload
   * 返回值：ChannelSendResult
   */
  async send(payload: ChannelSendPayload): Promise<ChannelSendResult> {
    if (this.isMockMode()) {
      this.logger.warn(
        `[JPUSH][MOCK] JPUSH_APP_KEY/MASTER_SECRET 未配置，模拟推送：` +
          `target=${payload.targetAddress}, code=${payload.templateCode}, content=${payload.content}`
      )
      return { ok: true, externalMsgId: `mock-jpush-${Date.now()}`, mock: true }
    }
    if (!payload.targetAddress) {
      return {
        ok: false,
        errorCode: 'JPUSH_TARGET_MISSING',
        errorMsg: 'JPush 缺 alias/registrationId'
      }
    }

    // 选择 audience 类型：纯数字 7+ 位 → registration_id，否则 alias
    const isRegId = /^\d{7,}$/.test(payload.targetAddress)
    const audience = isRegId
      ? { registration_id: [payload.targetAddress] }
      : { alias: [payload.targetAddress] }

    const auth = Buffer.from(`${this.appKey}:${this.masterSecret}`).toString('base64')
    const body = {
      platform: 'all',
      audience,
      notification: {
        alert: payload.content,
        android: { title: payload.title ?? '', alert: payload.content, extras: payload.vars },
        ios: {
          alert: { title: payload.title ?? '', body: payload.content },
          extras: payload.vars,
          sound: 'default'
        }
      },
      message: {
        msg_content: payload.content,
        title: payload.title ?? '',
        extras: payload.vars
      },
      options: { time_to_live: 86400 }
    }
    try {
      const resp = await fetch(JPUSH_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`
        },
        body: JSON.stringify(body)
      })
      const text = await resp.text()
      let parsed: JPushSendResp = {}
      try {
        parsed = JSON.parse(text) as JPushSendResp
      } catch {
        // 非 JSON 返回视为通信异常
      }
      if (!resp.ok || parsed.error) {
        const code = parsed.error?.code ?? resp.status
        const msg = parsed.error?.message ?? text
        this.logger.warn(`[JPUSH] 推送失败 code=${code} msg=${msg}`)
        return { ok: false, errorCode: `JPUSH_${code}`, errorMsg: msg }
      }
      return { ok: true, externalMsgId: parsed.msg_id ?? parsed.sendno ?? null }
    } catch (err) {
      this.logger.error(`[JPUSH] HTTP 异常：${(err as Error).message}`)
      return { ok: false, errorCode: 'JPUSH_HTTP_ERROR', errorMsg: (err as Error).message }
    }
  }
}
