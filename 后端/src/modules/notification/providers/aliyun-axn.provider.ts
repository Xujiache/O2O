/**
 * @file aliyun-axn.provider.ts
 * @stage P9/W5.E.1 (Sprint 5) — 阿里云号码中心 AXN 隐私号绑定（手写 RPC 签名，不依赖 SDK）
 * @desc 阿里云号码中心（dyplsapi）AXN 模式：
 *         POST/GET https://dyplsapi.aliyuncs.com/?<RPC v1.0 公共参数>&Action=...
 *         RPC v1.0 签名：HMAC-SHA1(StringToSign, AccessKeySecret + '&')
 *
 * 设计原则（与 Sprint 3 wechat-pay-v3.provider.ts / Sprint 5 jpush.provider.ts 一致）：
 *   - 任一关键 env 缺失 → enabled=false，所有方法 no-op + console.warn
 *   - 不引入 @alicloud/dyplsapi20170525 / aliyun-sdk 等第三方包
 *   - HTTP 用全局 fetch（Node 18+ 内置）
 *   - 签名使用 Node 内置 crypto
 *   - try/catch 全包；失败仅 logger.error + 返回 ok:false（best-effort）
 *
 * 文档：https://help.aliyun.com/document_detail/59595.html
 *
 * 用途：
 *   - 用户/商户/骑手三方间 AXN 隐私呼叫（订单配送过程隐藏真实手机号）
 *   - bindAxn → 返回中间号 secretNo + 绑定关系 secretId
 *   - unbindAxn → 解绑（订单完结后调用）
 *   - queryCallDetail → 查通话详单（人工申诉对账）
 *
 * @author Agent E (P9 Sprint 5)
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, randomUUID } from 'crypto'

/* ============================================================================
 * 类型
 * ============================================================================ */

/** AXN 绑定结果 */
export interface AxnBindResult {
  ok: boolean
  /** 阿里云返回的绑定关系 ID（解绑用） */
  secretId?: string
  /** 中间号（X 号，对外展示） */
  secretNo?: string
  reason?: string
  raw?: unknown
}

/** AXN 解绑结果 */
export interface AxnUnbindResult {
  ok: boolean
  reason?: string
  raw?: unknown
}

/** 通话详单查询结果（仅暴露关键字段） */
export interface AxnCallDetailResult {
  ok: boolean
  /** 通话总数 */
  total?: number
  /** 详单条目（原始结构透传） */
  records?: Array<Record<string, unknown>>
  reason?: string
  raw?: unknown
}

/* ============================================================================
 * 内部常量
 * ============================================================================ */

/** dyplsapi 默认 endpoint */
const DEFAULT_ENDPOINT = 'https://dyplsapi.aliyuncs.com/'

/** API Version（号码中心固定） */
const API_VERSION = '2017-05-25'

/** HTTP 请求超时（ms） */
const HTTP_TIMEOUT_MS = 10000

/** 默认绑定有效期（分钟），与 SaaS 默认 4 小时一致 */
const DEFAULT_EXPIRATION_MIN = 240

/* ============================================================================
 * Provider
 * ============================================================================ */

@Injectable()
export class AliyunAxnProvider {
  private readonly logger = new Logger(AliyunAxnProvider.name)

  /** 是否启用（凭证齐全时为 true） */
  readonly enabled: boolean

  private readonly accessKeyId: string
  private readonly accessKeySecret: string
  private readonly poolKey: string
  private readonly region: string
  private readonly endpoint: string

  constructor(config: ConfigService) {
    this.accessKeyId = config.get<string>('ALIYUN_AXN_ACCESS_KEY_ID', '')
    this.accessKeySecret = config.get<string>('ALIYUN_AXN_ACCESS_KEY_SECRET', '')
    this.poolKey = config.get<string>('ALIYUN_AXN_POOL_KEY', '')
    this.region = config.get<string>('ALIYUN_AXN_REGION', 'cn-hangzhou')
    this.endpoint = config.get<string>('ALIYUN_AXN_ENDPOINT', DEFAULT_ENDPOINT)

    this.enabled = Boolean(this.accessKeyId && this.accessKeySecret && this.poolKey)

    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(
        '[AliyunAxnProvider] disabled: 缺少 ALIYUN_AXN_ACCESS_KEY_ID / ALIYUN_AXN_ACCESS_KEY_SECRET / ALIYUN_AXN_POOL_KEY（所有方法走 no-op）'
      )
    } else {
      this.logger.log(`[AliyunAxnProvider] enabled region=${this.region} endpoint=${this.endpoint}`)
    }
  }

  /* ============================================================================
   * 1. 绑定 AXN 隐私号
   * ============================================================================ */

  /**
   * 绑定 AXN 隐私号
   * 参数：
   *   - phoneA            A 号码（如用户手机号）
   *   - phoneB            B 号码（如骑手手机号）
   *   - expirationMin     绑定有效期（分钟），默认 240 = 4 小时
   * 返回值：{ ok, secretId, secretNo, reason?, raw? }
   *
   * 阿里云接口：BindAxn
   *   关键参数：PoolKey / PhoneNoA / PhoneNoB / Expiration / AsrStatus(false)
   */
  async bindAxn(
    phoneA: string,
    phoneB: string,
    expirationMin: number = DEFAULT_EXPIRATION_MIN
  ): Promise<AxnBindResult> {
    if (!this.enabled) return this.disabledResult('bindAxn') as AxnBindResult
    if (!phoneA || !phoneB) {
      return { ok: false, reason: 'phone_empty' }
    }

    /* Expiration 必须为 ISO 时间字符串 yyyy-MM-dd HH:mm:ss UTC */
    const expireAt = new Date(Date.now() + expirationMin * 60 * 1000)
    const expireStr = this.formatExpiration(expireAt)

    const params: Record<string, string> = {
      Action: 'BindAxn',
      PoolKey: this.poolKey,
      PhoneNoA: phoneA,
      PhoneNoB: phoneB,
      Expiration: expireStr,
      AsrStatus: 'false'
    }

    const json = await this.requestRpc<{
      Code?: string
      Message?: string
      SecretBindDTO?: { SecretNo?: string; SubsId?: string }
    }>(params)
    if (!json.ok) return { ok: false, reason: json.reason, raw: json.raw }

    const body = json.body
    if (body.Code !== 'OK') {
      return {
        ok: false,
        reason: `aliyun_${body.Code ?? 'unknown'}`,
        raw: body
      }
    }
    const secretNo = body.SecretBindDTO?.SecretNo ?? ''
    const secretId = body.SecretBindDTO?.SubsId ?? ''
    if (!secretNo || !secretId) {
      return { ok: false, reason: 'no_secret_in_resp', raw: body }
    }
    return {
      ok: true,
      secretId,
      secretNo,
      raw: body
    }
  }

  /* ============================================================================
   * 2. 解绑 AXN
   * ============================================================================ */

  /**
   * 解绑 AXN（订单完结后调用，避免长期占用号池）
   * 参数：secretId  阿里云 SubsId（bindAxn 返回值）
   * 返回值：AxnUnbindResult
   */
  async unbindAxn(secretId: string): Promise<AxnUnbindResult> {
    if (!this.enabled) return this.disabledResult('unbindAxn')
    if (!secretId) {
      return { ok: false, reason: 'secret_id_empty' }
    }

    const params: Record<string, string> = {
      Action: 'UnbindSubscription',
      PoolKey: this.poolKey,
      SubsId: secretId,
      SecretNo: ''
    }

    const json = await this.requestRpc<{ Code?: string; Message?: string }>(params)
    if (!json.ok) return { ok: false, reason: json.reason, raw: json.raw }
    if (json.body.Code !== 'OK') {
      return {
        ok: false,
        reason: `aliyun_${json.body.Code ?? 'unknown'}`,
        raw: json.body
      }
    }
    return { ok: true, raw: json.body }
  }

  /* ============================================================================
   * 3. 查询通话详单
   * ============================================================================ */

  /**
   * 查询通话详单（人工申诉对账）
   * 参数：secretId  绑定关系 ID
   * 返回值：AxnCallDetailResult
   *
   * 阿里云接口：QueryCallStatus（按 SubsId 查询的最近通话）
   *  注：完整详单通常按时间段拉取（QueryRecordFileDownloadUrl / QuerySecretAsr）；
   *      本期只暴露最近通话，复杂场景由运营在阿里云控制台处理。
   */
  async queryCallDetail(secretId: string): Promise<AxnCallDetailResult> {
    if (!this.enabled) return this.disabledResult('queryCallDetail')
    if (!secretId) {
      return { ok: false, reason: 'secret_id_empty' }
    }

    const params: Record<string, string> = {
      Action: 'QueryCallStatus',
      PoolKey: this.poolKey,
      CallId: secretId
    }

    const json = await this.requestRpc<{
      Code?: string
      Message?: string
      SecretCallStatusDTO?: Record<string, unknown>
    }>(params)
    if (!json.ok) return { ok: false, reason: json.reason, raw: json.raw }
    if (json.body.Code !== 'OK') {
      return {
        ok: false,
        reason: `aliyun_${json.body.Code ?? 'unknown'}`,
        raw: json.body
      }
    }

    const dto = json.body.SecretCallStatusDTO
    const records = dto ? [dto] : []
    return {
      ok: true,
      total: records.length,
      records,
      raw: json.body
    }
  }

  /* ============================================================================
   * 内部工具：RPC 签名 + HTTP 调用
   * ============================================================================ */

  /**
   * 阿里云 RPC v1.0 签名 + 发送
   * 流程：
   *   1) 拼装公共参数 + 业务参数
   *   2) 按 key 升序拼成 canonicalQuery
   *   3) StringToSign = "GET&%2F&" + percentEncode(canonicalQuery)
   *   4) HMAC-SHA1(StringToSign, AccessKeySecret + '&') → base64 → percentEncode
   *   5) GET 发起请求；解析 JSON
   *
   * 返回值：{ ok: true, body } 或 { ok: false, reason, raw? }
   */
  private async requestRpc<T extends Record<string, unknown>>(
    bizParams: Record<string, string>
  ): Promise<{ ok: true; body: T } | { ok: false; reason: string; raw?: unknown }> {
    const common: Record<string, string> = {
      Format: 'JSON',
      Version: API_VERSION,
      AccessKeyId: this.accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      SignatureVersion: '1.0',
      SignatureNonce: randomUUID(),
      RegionId: this.region
    }
    const allParams: Record<string, string> = { ...common, ...bizParams }

    /* canonicalize */
    const sortedKeys = Object.keys(allParams).sort()
    const canonical = sortedKeys
      .map((k) => `${this.percentEncode(k)}=${this.percentEncode(allParams[k])}`)
      .join('&')

    const stringToSign = `GET&${this.percentEncode('/')}&${this.percentEncode(canonical)}`
    const signature = createHmac('sha1', `${this.accessKeySecret}&`)
      .update(stringToSign, 'utf8')
      .digest('base64')

    /* 加上 Signature 后形成最终 query */
    const finalQuery = `${canonical}&Signature=${this.percentEncode(signature)}`
    const url = `${this.endpoint}?${finalQuery}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'o2o-server/aliyun-axn-self'
        },
        signal: controller.signal
      })
      const text = await resp.text()
      let parsed: T = {} as T
      try {
        parsed = text ? (JSON.parse(text) as T) : ({} as T)
      } catch {
        return {
          ok: false,
          reason: 'parse_error',
          raw: text.slice(0, 500)
        }
      }
      if (resp.status >= 400) {
        this.logger.error(
          `[AliyunAxnProvider] HTTP ${resp.status} action=${bizParams.Action}：${text.slice(0, 500)}`
        )
        return {
          ok: false,
          reason: `http_${resp.status}`,
          raw: parsed
        }
      }
      return { ok: true, body: parsed }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[AliyunAxnProvider] network error action=${bizParams.Action}: ${msg}`)
      return { ok: false, reason: 'network_error' }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 阿里云 RPC 规范的 percentEncode：
   *   - 在 RFC3986 基础上：空格 → %20，* → %2A，~ 不编码，! ' ( ) 编码
   *   - encodeURIComponent 已贴近，但需修补 ! ' ( ) * 五个字符
   */
  private percentEncode(value: string): string {
    return encodeURIComponent(value)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A')
  }

  /**
   * Expiration 字段格式：yyyy-MM-dd HH:mm:ss（UTC，按阿里云示例固定）
   */
  private formatExpiration(d: Date): string {
    const pad = (n: number): string => String(n).padStart(2, '0')
    return (
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
    )
  }

  /** 统一构造 disabled 返回 */
  private disabledResult(method: string): AxnUnbindResult {
    // eslint-disable-next-line no-console
    console.warn(`[AliyunAxnProvider] ${method} no-op (disabled)`)
    return { ok: false, reason: 'disabled' }
  }
}
