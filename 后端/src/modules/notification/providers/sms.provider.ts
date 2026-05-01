/**
 * @file sms.provider.ts
 * @stage P9 / W5.C.3 (Sprint 5) — 阿里云短信 envelope HTTP provider
 * @desc 不依赖任何第三方 SDK，自实现阿里云短信服务 RPC v1 协议（与 Sprint 3
 *       wechat-pay-v3.provider.ts envelope 风格一致）：
 *
 *   - HTTP：全局 fetch（Node 18+）
 *   - 签名：HMAC-SHA1 / GET / SignatureMethod=HMAC-SHA1 / SignatureVersion=1.0
 *   - 时间：Timestamp = UTC ISO 8601（YYYY-MM-DDThh:mm:ssZ）
 *   - 接口：SendSms / SendBatchSms（API Version 2017-05-25）
 *
 * 关键 env：
 *   - SMS_ACCESS_KEY_ID         （必填）
 *   - SMS_ACCESS_KEY_SECRET     （必填）
 *   - SMS_SIGN_NAME             （必填，签名）
 *   - SMS_REGION                （可选，默认 cn-hangzhou，base url 自动拼）
 *
 * 任一关键 env 缺失 → enabled=false，所有方法 no-op + console.warn（与 sentry/wechat 一致）
 *
 * 阿里云签名步骤（GET RPC v1）：
 *   1) 把所有公共参数 + 业务参数排序（字典升序）
 *   2) 每个 k=v 分别按 RFC3986 percent-encode（' ' → %20，~ 不编码）
 *   3) 拼接成 k1=v1&k2=v2...（用 & 连接）
 *   4) StringToSign = 'GET' + '&' + percentEncode('/') + '&' + percentEncode(canonicalized)
 *   5) HMAC-SHA1 with key = AccessKeySecret + '&'  → base64 → URL-encode → Signature
 *   6) 把 Signature 拼到 query 末尾发出 GET 请求
 *
 * @author Agent C (P9 Sprint 5)
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, randomBytes } from 'crypto'

/** 默认地域（base url 拼为 https://dysmsapi.{region}.aliyuncs.com，cn-hangzhou 走全球域名） */
const DEFAULT_REGION = 'cn-hangzhou'

/** 阿里云短信 API 版本 */
const SMS_API_VERSION = '2017-05-25'

/** HTTP 超时（ms） */
const HTTP_TIMEOUT_MS = 10000

/** 短信发送结果 */
export interface SmsSendResult {
  ok: boolean
  bizId?: string
  code?: string
  message?: string
}

/** 批量发送结果（每号一个 result，按入参顺序对齐） */
export interface SmsBatchResult {
  ok: boolean
  bizId?: string
  code?: string
  message?: string
}

@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name)

  /** 是否启用（凭证齐全） */
  readonly enabled: boolean

  private readonly accessKeyId: string
  private readonly accessKeySecret: string
  private readonly signName: string
  private readonly region: string
  /** 完整 endpoint：https://dysmsapi.{region}.aliyuncs.com */
  private readonly baseUrl: string

  constructor(config: ConfigService) {
    this.accessKeyId = config.get<string>('SMS_ACCESS_KEY_ID', '')
    this.accessKeySecret = config.get<string>('SMS_ACCESS_KEY_SECRET', '')
    this.signName = config.get<string>('SMS_SIGN_NAME', '')
    this.region = config.get<string>('SMS_REGION', DEFAULT_REGION)
    /* cn-hangzhou 历史上走的是全球 dysmsapi.aliyuncs.com；其他 region 才走 dysmsapi.{region}.aliyuncs.com
       为了兼容，cn-hangzhou 仍用全球域名。 */
    this.baseUrl =
      this.region === DEFAULT_REGION
        ? 'https://dysmsapi.aliyuncs.com'
        : `https://dysmsapi.${this.region}.aliyuncs.com`

    this.enabled = Boolean(this.accessKeyId && this.accessKeySecret && this.signName)

    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(
        '[SmsProvider] disabled: 缺少 SMS_ACCESS_KEY_ID / SMS_ACCESS_KEY_SECRET / SMS_SIGN_NAME'
      )
    } else {
      this.logger.log(
        `[SmsProvider] enabled signName=${this.signName} region=${this.region} baseUrl=${this.baseUrl}`
      )
    }
  }

  /**
   * 发送单条短信
   * 入参：
   *   - phone        11 位手机号（仅大陆；港澳台需带国际区号 +xx，本期不支持）
   *   - templateCode 阿里云模板 Code（如 SMS_123456789）
   *   - params       模板参数（如 { code: '123456' } → JSON.stringify 进 TemplateParam）
   * 出参：SmsSendResult
   *
   * 失败：
   *   - enabled=false → no-op + warn（返回 ok=true 以免阻塞业务，但 message 提示）
   *   - HTTP / API Code != 'OK' → ok=false + 透传 code/message（不抛，由业务层降级）
   */
  async sendSms(
    phone: string,
    templateCode: string,
    params: Record<string, string>
  ): Promise<SmsSendResult> {
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(`[SmsProvider] sendSms no-op (disabled) phone=${this.maskPhone(phone)}`)
      return { ok: true, code: 'DISABLED', message: 'sms provider disabled' }
    }
    try {
      const business: Record<string, string> = {
        Action: 'SendSms',
        Version: SMS_API_VERSION,
        PhoneNumbers: phone,
        SignName: this.signName,
        TemplateCode: templateCode,
        TemplateParam: JSON.stringify(params ?? {})
      }
      const json = await this.requestRpcV1<{
        Code?: string
        Message?: string
        BizId?: string
      }>(business)
      if (json.Code !== 'OK') {
        this.logger.warn(
          `[SmsProvider] sendSms 失败 phone=${this.maskPhone(phone)} code=${json.Code} msg=${json.Message}`
        )
        return { ok: false, code: json.Code, message: json.Message }
      }
      return { ok: true, bizId: json.BizId, code: 'OK' }
    } catch (err) {
      this.logger.warn(
        `[SmsProvider] sendSms 异常 phone=${this.maskPhone(phone)}：${(err as Error).message}`
      )
      return { ok: false, code: 'EXCEPTION', message: (err as Error).message }
    }
  }

  /**
   * 批量发送短信（多号同模板，模板参数对齐）
   * 入参：
   *   - phones       手机号数组（最多 1000；阿里云上限）
   *   - templateCode 模板 Code
   *   - params       模板参数（同模板多号共用）
   * 出参：SmsBatchResult
   *
   * 实现：直接用 SendBatchSms 接口（PhoneNumberJson / SignNameJson / TemplateParamJson 都是 JSON 字符串）
   */
  async sendBatch(
    phones: string[],
    templateCode: string,
    params: Record<string, string>
  ): Promise<SmsBatchResult> {
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(`[SmsProvider] sendBatch no-op (disabled) count=${phones?.length ?? 0}`)
      return { ok: true, code: 'DISABLED', message: 'sms provider disabled' }
    }
    if (!Array.isArray(phones) || phones.length === 0) {
      return { ok: false, code: 'PARAM_INVALID', message: 'phones 不可为空' }
    }
    try {
      const signNames = phones.map(() => this.signName)
      const paramStr = JSON.stringify(params ?? {})
      const paramArr = phones.map(() => paramStr)
      const business: Record<string, string> = {
        Action: 'SendBatchSms',
        Version: SMS_API_VERSION,
        PhoneNumberJson: JSON.stringify(phones),
        SignNameJson: JSON.stringify(signNames),
        TemplateCode: templateCode,
        TemplateParamJson: JSON.stringify(paramArr)
      }
      const json = await this.requestRpcV1<{
        Code?: string
        Message?: string
        BizId?: string
      }>(business)
      if (json.Code !== 'OK') {
        this.logger.warn(
          `[SmsProvider] sendBatch 失败 count=${phones.length} code=${json.Code} msg=${json.Message}`
        )
        return { ok: false, code: json.Code, message: json.Message }
      }
      return { ok: true, bizId: json.BizId, code: 'OK' }
    } catch (err) {
      this.logger.warn(
        `[SmsProvider] sendBatch 异常 count=${phones.length}：${(err as Error).message}`
      )
      return { ok: false, code: 'EXCEPTION', message: (err as Error).message }
    }
  }

  /* ============================================================================
   * 内部
   * ============================================================================ */

  /**
   * 阿里云 RPC v1 GET 请求（HMAC-SHA1 签名）
   * 入参：business 业务参数（含 Action / Version / 业务字段）
   * 出参：JSON 解析后对象
   */
  private async requestRpcV1<T>(business: Record<string, string>): Promise<T> {
    const allParams: Record<string, string> = {
      ...business,
      AccessKeyId: this.accessKeyId,
      Format: 'JSON',
      RegionId: this.region,
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: randomBytes(16).toString('hex'),
      SignatureVersion: '1.0',
      Timestamp: SmsProvider.utcIsoTimestamp()
    }
    const signature = this.buildSignature('GET', allParams)
    allParams.Signature = signature

    /* 把 Signature 也按相同编码方式拼到 query */
    const query = Object.entries(allParams)
      .map(([k, v]) => `${SmsProvider.percentEncode(k)}=${SmsProvider.percentEncode(v)}`)
      .join('&')
    const url = `${this.baseUrl}/?${query}`

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
    try {
      const resp = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'o2o-server/sms-provider-self' }
      })
      const text = await resp.text()
      if (!text) return {} as T
      return JSON.parse(text) as T
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 构造 RPC v1 签名（HMAC-SHA1 → base64）
   * 入参：method='GET' / params 不含 Signature 的全量参数
   * 出参：base64 字符串（未做 URL-encode；URL 拼装时再编码）
   */
  private buildSignature(method: string, params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort()
    const canonicalized = sortedKeys
      .map((k) => `${SmsProvider.percentEncode(k)}=${SmsProvider.percentEncode(params[k])}`)
      .join('&')
    const stringToSign = `${method}&${SmsProvider.percentEncode('/')}&${SmsProvider.percentEncode(canonicalized)}`
    const hmac = createHmac('sha1', `${this.accessKeySecret}&`)
    hmac.update(stringToSign, 'utf8')
    return hmac.digest('base64')
  }

  /**
   * RFC3986 percent-encode（与 Java URLEncoder 阿里云版一致）
   * 规则：' ' → %20；'+' → %2B；'*' → %2A；'%7E' 还原为 '~'
   */
  static percentEncode(str: string): string {
    return encodeURIComponent(str).replace(/\+/g, '%20').replace(/\*/g, '%2A').replace(/%7E/g, '~')
  }

  /**
   * UTC ISO 8601 时间戳（YYYY-MM-DDTHH:mm:ssZ）
   * 与阿里云示例严格一致；不带毫秒
   */
  static utcIsoTimestamp(date: Date = new Date()): string {
    const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`)
    return (
      `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
      `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`
    )
  }

  /** 日志脱敏：保留前 3 + 后 4 */
  private maskPhone(p: string): string {
    if (!p || p.length < 7) return '***'
    return `${p.slice(0, 3)}****${p.slice(-4)}`
  }
}
