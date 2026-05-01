/**
 * @file jpush.provider.ts
 * @stage P9/W5.B.1 (Sprint 5) — 极光推送 V3 envelope HTTP（手写，不依赖 SDK）
 * @desc JPush V3 push API：
 *         POST https://api.jpush.cn/v3/push
 *         Authorization: Basic base64(appKey:masterSecret)
 *         body: { platform, audience, notification, options }
 *
 * 设计原则（与 Sprint 3 wechat-pay-v3.provider.ts / Sprint 2 sentry.ts 一致）：
 *   - 任一关键 env 缺失 → enabled=false，所有方法 no-op + console.warn
 *   - 不引入 jpush-async / jpush 等第三方包
 *   - HTTP 用全局 fetch（Node 18+ 内置）
 *   - try/catch 全包；失败仅 logger.error + 返回 { ok: false } 不抛错（best-effort）
 *
 * @author Agent B (P9 Sprint 5)
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { PushResult } from '../notification.types'

/* ============================================================================
 * 内部常量
 * ============================================================================ */

/** V3 默认生产 base URL */
const DEFAULT_BASE_URL = 'https://api.jpush.cn'

/** HTTP 请求超时（ms） */
const HTTP_TIMEOUT_MS = 10000

/* ============================================================================
 * 内部类型
 * ============================================================================ */

/** 极光 V3 push API 返回 */
interface JPushApiResponse {
  sendno?: string
  msg_id?: string
  error?: { code: number; message: string }
}

/** audience 字段（4 选 1） */
interface JPushAudience {
  registration_id?: string[]
  alias?: string[]
  tag?: string[]
}

/** body */
interface JPushPushBody {
  platform: 'all'
  audience: JPushAudience | 'all'
  notification: {
    alert: string
    android: { title: string; alert: string; extras?: Record<string, unknown> }
    ios: {
      alert: { title: string; body: string }
      extras?: Record<string, unknown>
      sound: 'default'
    }
  }
  options: {
    apns_production: boolean
    time_to_live: number
  }
}

/* ============================================================================
 * Provider
 * ============================================================================ */

@Injectable()
export class JPushProvider {
  private readonly logger = new Logger(JPushProvider.name)

  /** 是否启用（凭证齐全时为 true） */
  readonly enabled: boolean

  private readonly appKey: string
  private readonly masterSecret: string
  private readonly baseUrl: string
  private readonly apnsProduction: boolean

  constructor(config: ConfigService) {
    this.appKey = config.get<string>('JPUSH_APP_KEY', '')
    this.masterSecret = config.get<string>('JPUSH_MASTER_SECRET', '')
    this.baseUrl = config.get<string>('JPUSH_BASE_URL', DEFAULT_BASE_URL)
    this.apnsProduction = config.get<string>('JPUSH_APNS_PRODUCTION', 'false') === 'true'

    this.enabled = Boolean(this.appKey && this.masterSecret)

    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(
        '[JPushProvider] disabled: 缺少 JPUSH_APP_KEY / JPUSH_MASTER_SECRET（所有方法走 no-op）'
      )
    } else {
      this.logger.log(`[JPushProvider] enabled baseUrl=${this.baseUrl}`)
    }
  }

  /* ============================================================================
   * 1. 按 registrationId 推送
   * ============================================================================ */

  /**
   * 按设备 registrationId 精准推送
   * 参数：rids 设备 registrationId 列表 / title 标题 / content 正文 / extras 附加数据
   * 返回值：{ ok, msgId?, sendNo?, raw, reason? }
   */
  async pushByRegistrationId(
    rids: string[],
    title: string,
    content: string,
    extras?: Record<string, unknown>
  ): Promise<PushResult> {
    if (!this.enabled) return this.disabledResult('pushByRegistrationId')
    if (!rids || rids.length === 0) {
      return { ok: false, reason: 'rids_empty' }
    }
    return this.doPush({ registration_id: rids }, title, content, extras)
  }

  /* ============================================================================
   * 2. 按 alias 推送
   * ============================================================================ */

  /**
   * 按业务别名（一般为 userId）推送
   * 参数：aliases 别名列表 / title / content / extras
   * 返回值：PushResult
   */
  async pushByAlias(
    aliases: string[],
    title: string,
    content: string,
    extras?: Record<string, unknown>
  ): Promise<PushResult> {
    if (!this.enabled) return this.disabledResult('pushByAlias')
    if (!aliases || aliases.length === 0) {
      return { ok: false, reason: 'aliases_empty' }
    }
    return this.doPush({ alias: aliases }, title, content, extras)
  }

  /* ============================================================================
   * 3. 按 tag 推送
   * ============================================================================ */

  /**
   * 按标签推送（如 rider / merchant 分组）
   * 参数：tags 标签列表 / title / content / extras
   * 返回值：PushResult
   */
  async pushByTag(
    tags: string[],
    title: string,
    content: string,
    extras?: Record<string, unknown>
  ): Promise<PushResult> {
    if (!this.enabled) return this.disabledResult('pushByTag')
    if (!tags || tags.length === 0) {
      return { ok: false, reason: 'tags_empty' }
    }
    return this.doPush({ tag: tags }, title, content, extras)
  }

  /* ============================================================================
   * 4. 全员推送
   * ============================================================================ */

  /**
   * 全员推送（慎用）
   * 参数：title / content / extras
   * 返回值：PushResult
   */
  async pushAll(
    title: string,
    content: string,
    extras?: Record<string, unknown>
  ): Promise<PushResult> {
    if (!this.enabled) return this.disabledResult('pushAll')
    return this.doPush('all', title, content, extras)
  }

  /* ============================================================================
   * 内部工具
   * ============================================================================ */

  /**
   * 实际发起 HTTP 调用
   * 参数：audience / title / content / extras
   * 返回值：PushResult
   *
   * 错误处理：
   *   - HTTP 4xx / 5xx → ok=false + reason='http_<status>'
   *   - 业务 error 字段 → ok=false + reason='jpush_<code>'
   *   - fetch 异常 → ok=false + reason='network_error'
   */
  private async doPush(
    audience: JPushAudience | 'all',
    title: string,
    content: string,
    extras?: Record<string, unknown>
  ): Promise<PushResult> {
    const body: JPushPushBody = {
      platform: 'all',
      audience,
      notification: {
        alert: content,
        android: { title, alert: content, extras },
        ios: { alert: { title, body: content }, extras, sound: 'default' }
      },
      options: {
        apns_production: this.apnsProduction,
        time_to_live: 86400
      }
    }

    const auth = Buffer.from(`${this.appKey}:${this.masterSecret}`).toString('base64')
    const url = `${this.baseUrl}/v3/push`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'o2o-server/jpush-self'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      const text = await resp.text()
      let parsed: JPushApiResponse = {}
      try {
        parsed = text ? (JSON.parse(text) as JPushApiResponse) : {}
      } catch {
        /* 非 JSON 返回视为通信异常 */
      }
      if (resp.status >= 400) {
        this.logger.error(`[JPushProvider] HTTP ${resp.status} ${url}：${text.slice(0, 500)}`)
        return {
          ok: false,
          reason: `http_${resp.status}`,
          raw: parsed
        }
      }
      if (parsed.error) {
        this.logger.error(
          `[JPushProvider] biz error code=${parsed.error.code} msg=${parsed.error.message}`
        )
        return {
          ok: false,
          reason: `jpush_${parsed.error.code}`,
          raw: parsed
        }
      }
      return {
        ok: true,
        msgId: parsed.msg_id,
        sendNo: parsed.sendno,
        raw: parsed
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[JPushProvider] network error: ${msg}`)
      return { ok: false, reason: 'network_error' }
    } finally {
      clearTimeout(timer)
    }
  }

  /** 统一构造 disabled 返回 */
  private disabledResult(method: string): PushResult {
    // eslint-disable-next-line no-console
    console.warn(`[JPushProvider] ${method} no-op (disabled)`)
    return { ok: false, reason: 'disabled' }
  }
}
