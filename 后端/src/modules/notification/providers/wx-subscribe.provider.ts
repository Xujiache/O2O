/**
 * @file wx-subscribe.provider.ts
 * @stage P9/W5.E.2 (Sprint 5) — 微信小程序订阅消息（手写 HTTP，不依赖 SDK）
 * @desc 微信小程序订阅消息：
 *         - GET /cgi-bin/token?appid=&secret=&grant_type=client_credential（access_token，2h 有效）
 *         - POST /cgi-bin/message/subscribe/send?access_token=...
 *
 * 设计原则（与 Sprint 3 wechat-pay-v3.provider.ts / Sprint 5 jpush.provider.ts 一致）：
 *   - 任一关键 env 缺失 → enabled=false，所有方法 no-op + console.warn
 *   - 不引入 wechat / wx-sdk 等第三方包
 *   - HTTP 用全局 fetch（Node 18+ 内置）
 *   - access_token 内存缓存 7000s（提前 200s 续期；多实例可后续接 Redis）
 *
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/subscribe-message/
 *
 * @author Agent E (P9 Sprint 5)
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/* ============================================================================
 * 类型
 * ============================================================================ */

/** 订阅消息发送结果 */
export interface WxSubscribeResult {
  ok: boolean
  /** 微信返回的 errcode；ok=0 / 业务错误 != 0 */
  errcode?: number
  /** 微信返回的 errmsg */
  errmsg?: string
  /** 失败原因（disabled / http_xxx / network_error / token_fetch_failed） */
  reason?: string
  raw?: unknown
}

/** access_token 缓存条目 */
interface TokenCacheEntry {
  token: string
  /** 过期时间戳（ms） */
  expireAt: number
}

/* ============================================================================
 * 内部常量
 * ============================================================================ */

/** 微信开放接口默认 base URL */
const DEFAULT_BASE_URL = 'https://api.weixin.qq.com'

/** access_token 缓存有效期（秒）—— 微信返回 7200，提前 200 秒续期 */
const TOKEN_CACHE_TTL_MS = 7000 * 1000

/** HTTP 请求超时（ms） */
const HTTP_TIMEOUT_MS = 10000

/* ============================================================================
 * Provider
 * ============================================================================ */

@Injectable()
export class WxSubscribeProvider {
  private readonly logger = new Logger(WxSubscribeProvider.name)

  /** 是否启用（凭证齐全时为 true） */
  readonly enabled: boolean

  private readonly appId: string
  private readonly appSecret: string
  private readonly baseUrl: string
  /** 业务模板别名 → 微信模板 ID（来自 env JSON） */
  private readonly templateMap: Record<string, string>

  /** access_token 进程内缓存 */
  private tokenCache: TokenCacheEntry | null = null

  constructor(config: ConfigService) {
    this.appId = config.get<string>('WX_APP_ID', '')
    this.appSecret = config.get<string>('WX_APP_SECRET', '')
    this.baseUrl = config.get<string>('WX_API_BASE_URL', DEFAULT_BASE_URL)

    const tplJson = config.get<string>('WX_SUBSCRIBE_TEMPLATES', '')
    this.templateMap = this.parseTemplateMap(tplJson)

    this.enabled = Boolean(this.appId && this.appSecret)

    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(
        '[WxSubscribeProvider] disabled: 缺少 WX_APP_ID / WX_APP_SECRET（所有方法走 no-op）'
      )
    } else {
      this.logger.log(
        `[WxSubscribeProvider] enabled baseUrl=${this.baseUrl} templates=${Object.keys(this.templateMap).length}`
      )
    }
  }

  /* ============================================================================
   * 1. 发送订阅消息
   * ============================================================================ */

  /**
   * 发送订阅消息
   * 参数：
   *   - openId      用户 openId
   *   - templateId  微信模板 ID（也可传 templateMap 中的别名 key，会自动映射）
   *   - data        模板变量 { keyword: { value: string } }
   *   - page        点击跳转的小程序页面（可选）
   * 返回值：WxSubscribeResult
   */
  async sendSubscribeMessage(
    openId: string,
    templateId: string,
    data: Record<string, { value: string }>,
    page?: string
  ): Promise<WxSubscribeResult> {
    if (!this.enabled) return this.disabledResult('sendSubscribeMessage')
    if (!openId || !templateId) {
      return { ok: false, reason: 'param_empty' }
    }

    /* 别名映射 */
    const finalTplId = this.templateMap[templateId] ?? templateId

    /* 取 token */
    const token = await this.getAccessToken()
    if (!token) {
      return { ok: false, reason: 'token_fetch_failed' }
    }

    const url = `${this.baseUrl}/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`
    const body: Record<string, unknown> = {
      touser: openId,
      template_id: finalTplId,
      data
    }
    if (page) body.page = page

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'o2o-server/wx-subscribe-self'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      const text = await resp.text()
      let parsed: { errcode?: number; errmsg?: string } = {}
      try {
        parsed = text ? (JSON.parse(text) as { errcode?: number; errmsg?: string }) : {}
      } catch {
        return { ok: false, reason: 'parse_error', raw: text.slice(0, 500) }
      }
      if (resp.status >= 400) {
        this.logger.error(`[WxSubscribeProvider] HTTP ${resp.status}：${text.slice(0, 500)}`)
        return {
          ok: false,
          reason: `http_${resp.status}`,
          errcode: parsed.errcode,
          errmsg: parsed.errmsg,
          raw: parsed
        }
      }
      /* 业务错误：errcode != 0 */
      if (parsed.errcode && parsed.errcode !== 0) {
        /* 40001 access_token 过期：清缓存（下次自动续）*/
        if (parsed.errcode === 40001 || parsed.errcode === 42001) {
          this.tokenCache = null
        }
        return {
          ok: false,
          errcode: parsed.errcode,
          errmsg: parsed.errmsg,
          reason: `wx_${parsed.errcode}`,
          raw: parsed
        }
      }
      return {
        ok: true,
        errcode: parsed.errcode ?? 0,
        errmsg: parsed.errmsg,
        raw: parsed
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[WxSubscribeProvider] network error: ${msg}`)
      return { ok: false, reason: 'network_error' }
    } finally {
      clearTimeout(timer)
    }
  }

  /* ============================================================================
   * 内部工具
   * ============================================================================ */

  /**
   * 获取 access_token（带内存缓存，提前 200s 续期）
   * 返回值：token 字符串；失败返回 ''
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now()
    if (this.tokenCache && this.tokenCache.expireAt > now) {
      return this.tokenCache.token
    }

    const url =
      `${this.baseUrl}/cgi-bin/token?` +
      `grant_type=client_credential&appid=${encodeURIComponent(this.appId)}&secret=${encodeURIComponent(this.appSecret)}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'o2o-server/wx-subscribe-self' },
        signal: controller.signal
      })
      const text = await resp.text()
      if (resp.status >= 400) {
        this.logger.error(`[WxSubscribeProvider] token HTTP ${resp.status}：${text.slice(0, 200)}`)
        return ''
      }
      let parsed: {
        access_token?: string
        expires_in?: number
        errcode?: number
        errmsg?: string
      } = {}
      try {
        parsed = text ? JSON.parse(text) : {}
      } catch {
        return ''
      }
      if (!parsed.access_token) {
        this.logger.error(
          `[WxSubscribeProvider] token errcode=${parsed.errcode} errmsg=${parsed.errmsg}`
        )
        return ''
      }
      this.tokenCache = {
        token: parsed.access_token,
        expireAt: now + TOKEN_CACHE_TTL_MS
      }
      return parsed.access_token
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[WxSubscribeProvider] token network error: ${msg}`)
      return ''
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 解析 WX_SUBSCRIBE_TEMPLATES JSON
   * 失败 / 空 → 空 map（直接以入参 templateId 透传）
   */
  private parseTemplateMap(raw: string): Record<string, string> {
    if (!raw) return {}
    try {
      const obj = JSON.parse(raw) as unknown
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const map: Record<string, string> = {}
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (typeof v === 'string' && v.length > 0) map[k] = v
        }
        return map
      }
      return {}
    } catch {
      // eslint-disable-next-line no-console
      console.warn('[WxSubscribeProvider] WX_SUBSCRIBE_TEMPLATES JSON 非法，已忽略')
      return {}
    }
  }

  /** 统一构造 disabled 返回 */
  private disabledResult(method: string): WxSubscribeResult {
    // eslint-disable-next-line no-console
    console.warn(`[WxSubscribeProvider] ${method} no-op (disabled)`)
    return { ok: false, reason: 'disabled' }
  }

  /**
   * 仅供单测：清除内存 token 缓存
   */
  clearTokenCacheForTest(): void {
    this.tokenCache = null
  }
}
