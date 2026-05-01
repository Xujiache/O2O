/**
 * @file wechat-pay-v3.provider.ts
 * @stage P9/W3.C.1 (Sprint 3) — WeChat Pay V3 真实 provider（envelope 风格手写，不依赖第三方包）
 * @desc 基于 Node 内置 crypto + 全局 fetch 自实现 V3 协议：
 *         - JSAPI 下单（POST /v3/pay/transactions/jsapi）
 *         - 异步通知验签 + AES-256-GCM 解密 resource
 *         - 订单查询（GET /v3/pay/transactions/out-trade-no/{out_trade_no}）
 *         - 退款（POST /v3/refund/domestic/refunds）
 *
 * 设计原则（与 Sprint 2 sentry.ts 一致）：
 *   - 任一关键 env 缺失 → enabled=false，所有方法 no-op + console.warn
 *   - 不引入 wechatpay-axios-plugin / wechatpay-node-v3 等第三方包
 *   - 签名/验签/解密均使用 Node 内置 crypto（crypto.createSign('RSA-SHA256') / aes-256-gcm）
 *   - HTTP 用全局 fetch（Node 18+ 内置）
 *
 * 平台证书校验（最简版）：
 *   构造时若提供 WECHAT_PAY_V3_PLATFORM_PUBLIC_KEY（PEM 公钥），用它验回调签名；
 *   未提供 → 回调验签直接返回 valid=false（不允许编造签名通过）。
 *   进阶版（自动 GET /v3/certificates）将作为后续迭代。
 *
 * 路径区分：
 *   - 生产 base：https://api.mch.weixin.qq.com（默认）
 *   - 沙箱 base：使用 WECHAT_PAY_V3_SANDBOX_BASE_URL 覆盖
 *
 * 金额：外部按"分"传入；BigNumber 防浮点抖动。
 *
 * @author Agent C (P9 Sprint 3)
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  createCipheriv,
  createDecipheriv,
  createSign,
  createVerify,
  randomBytes,
  type KeyObject
} from 'crypto'
import BigNumber from 'bignumber.js'

/* ============================================================================
 * 类型
 * ============================================================================ */

/** 微信小程序 wx.requestPayment 入参 */
export interface WechatPaySignParams {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

/** JSAPI 下单返回 */
export interface WechatPayJsapiResult {
  prepayId: string
  paySign: WechatPaySignParams
}

/** 回调验签 + 解密结果 */
export interface WechatPayCallbackResult {
  valid: boolean
  reason?: string
  resource?: {
    orderNo: string
    transactionId: string
    payerOpenId: string
    /** 三方实付金额（分） */
    amount: number
    raw: Record<string, unknown>
  }
}

/** 订单查询返回 */
export interface WechatPayQueryResult {
  status: 'SUCCESS' | 'NOTPAY' | 'CLOSED' | 'REFUND' | 'PAYERROR' | 'USERPAYING' | string
  transactionId?: string
}

/** 退款返回 */
export interface WechatPayRefundResult {
  refundId: string
  status: 'PROCESSING' | 'SUCCESS' | 'FAIL' | string
}

/** 回调请求头（V3 4 个固定头） */
export interface WechatPayCallbackHeaders {
  'wechatpay-timestamp': string
  'wechatpay-nonce': string
  'wechatpay-signature': string
  'wechatpay-serial': string
}

/* ============================================================================
 * 内部常量
 * ============================================================================ */

/** V3 默认生产 base URL */
const DEFAULT_BASE_URL = 'https://api.mch.weixin.qq.com'

/** V3 回调时间窗（5 分钟，参考微信支付 V3 规范） */
const CALLBACK_TS_WINDOW_SECONDS = 300

/** HTTP 请求超时（ms） */
const HTTP_TIMEOUT_MS = 15000

/* ============================================================================
 * Provider
 * ============================================================================ */

@Injectable()
export class WechatPayV3Provider {
  private readonly logger = new Logger(WechatPayV3Provider.name)

  /** 是否启用（凭证齐全时为 true） */
  readonly enabled: boolean

  /** 商户号 */
  private readonly mchid: string
  /** 公众号 / 小程序 AppId */
  private readonly appId: string
  /** 商户证书序列号 */
  private readonly serialNo: string
  /** APIv3 密钥（base64 / 32 字节，AES-GCM 解密用） */
  private readonly apiV3Key: string
  /** 商户私钥 PEM 字符串 */
  private readonly privateKeyPem: string
  /** 平台公钥 PEM 字符串（用于回调验签；可选） */
  private readonly platformPublicKeyPem: string
  /** 异步通知 URL */
  private readonly notifyUrl: string
  /** base URL（默认 DEFAULT_BASE_URL，沙箱可覆盖） */
  private readonly baseUrl: string

  constructor(config: ConfigService) {
    this.mchid = config.get<string>('WECHAT_PAY_V3_MCHID', '')
    this.appId = config.get<string>('WECHAT_PAY_V3_APPID', '')
    this.serialNo = config.get<string>('WECHAT_PAY_V3_SERIAL_NO', '')
    this.apiV3Key = config.get<string>('WECHAT_PAY_V3_API_V3_KEY', '')
    this.privateKeyPem = config.get<string>('WECHAT_PAY_V3_PRIVATE_KEY', '')
    this.platformPublicKeyPem = config.get<string>('WECHAT_PAY_V3_PLATFORM_PUBLIC_KEY', '')
    this.notifyUrl = config.get<string>('WECHAT_PAY_V3_NOTIFY_URL', '')
    this.baseUrl = config.get<string>('WECHAT_PAY_V3_SANDBOX_BASE_URL', DEFAULT_BASE_URL)

    /* 关键 env 任一缺失 → 降级 */
    this.enabled = Boolean(
      this.mchid &&
      this.appId &&
      this.serialNo &&
      this.apiV3Key &&
      this.privateKeyPem &&
      this.notifyUrl
    )

    if (!this.enabled) {
      /* 与 sentry.ts 一致：env 空 → no-op + console.warn */
      // eslint-disable-next-line no-console
      console.warn(
        '[WechatPayV3Provider] disabled: 缺少 WECHAT_PAY_V3_MCHID/APPID/SERIAL_NO/API_V3_KEY/PRIVATE_KEY/NOTIFY_URL'
      )
    } else {
      this.logger.log(
        `[WechatPayV3Provider] enabled mchid=${this.mchid} appId=${this.appId} baseUrl=${this.baseUrl}`
      )
    }
  }

  /* ============================================================================
   * 1. JSAPI 下单
   * ============================================================================ */

  /**
   * JSAPI 下单
   * 参数：
   *   - orderNo       平台订单号（落到 out_trade_no）
   *   - amountFen     金额（分，整数；外部如有元单位先 ×100 再传入）
   *   - openId        小程序 / 公众号 openId
   *   - description   商品描述
   * 返回值：{ prepayId, paySign }
   *
   * 失败：
   *   - enabled=false 时：返回空对象 + warn
   *   - HTTP 非 200：抛 Error 由上层捕获
   */
  async jsapiPay(
    orderNo: string,
    amountFen: number,
    openId: string,
    description: string
  ): Promise<WechatPayJsapiResult> {
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(`[WechatPayV3Provider] jsapiPay no-op (disabled) orderNo=${orderNo}`)
      return {
        prepayId: '',
        paySign: {
          appId: '',
          timeStamp: '',
          nonceStr: '',
          package: '',
          signType: 'RSA',
          paySign: ''
        }
      }
    }

    const amountBn = new BigNumber(amountFen)
    if (!amountBn.isFinite() || !amountBn.isInteger() || amountBn.isLessThanOrEqualTo(0)) {
      throw new Error(`[WechatPayV3Provider] amountFen 非法：${amountFen}`)
    }

    const reqBody = {
      appid: this.appId,
      mchid: this.mchid,
      description,
      out_trade_no: orderNo,
      notify_url: this.notifyUrl,
      amount: { total: amountBn.toNumber(), currency: 'CNY' },
      payer: { openid: openId }
    }

    const path = '/v3/pay/transactions/jsapi'
    const bodyStr = JSON.stringify(reqBody)
    const responseJson = await this.requestV3<{ prepay_id?: string }>('POST', path, bodyStr)

    if (!responseJson.prepay_id) {
      throw new Error(
        `[WechatPayV3Provider] jsapiPay 未返回 prepay_id：${JSON.stringify(responseJson)}`
      )
    }

    /* 拼装小程序 wx.requestPayment 入参（V3 RSA 签名）*/
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = this.shortNonce()
    const pkg = `prepay_id=${responseJson.prepay_id}`
    const signPayload = `${this.appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
    const paySign = this.rsaSignBase64(signPayload)

    return {
      prepayId: responseJson.prepay_id,
      paySign: {
        appId: this.appId,
        timeStamp,
        nonceStr,
        package: pkg,
        signType: 'RSA',
        paySign
      }
    }
  }

  /* ============================================================================
   * 2. 回调验签 + 解密
   * ============================================================================ */

  /**
   * 异步通知验签 + 解密 resource
   * 参数：
   *   - headers   { wechatpay-timestamp, wechatpay-nonce, wechatpay-signature, wechatpay-serial }
   *   - body      原始 raw body（字符串；NOT JSON.parse 后的对象，因为验签依赖原文）
   * 返回值：WechatPayCallbackResult
   *
   * 流程：
   *   1) 5 分钟时间窗校验（ts）
   *   2) 平台公钥 RSA-SHA256 验签 ${ts}\n${nonce}\n${body}\n
   *   3) AES-256-GCM 解密 resource.ciphertext（key=apiV3Key, iv=resource.nonce, aad=resource.associated_data）
   *   4) 解析 out_trade_no / transaction_id / payer / amount.payer_total
   */
  async verifyCallback(
    headers: WechatPayCallbackHeaders,
    body: string
  ): Promise<WechatPayCallbackResult> {
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn('[WechatPayV3Provider] verifyCallback no-op (disabled)')
      return { valid: false, reason: 'disabled' }
    }

    try {
      const ts = Number(headers['wechatpay-timestamp'])
      if (!Number.isFinite(ts)) {
        return { valid: false, reason: 'wechatpay-timestamp 非数字' }
      }
      const now = Math.floor(Date.now() / 1000)
      if (Math.abs(now - ts) > CALLBACK_TS_WINDOW_SECONDS) {
        return { valid: false, reason: 'wechatpay-timestamp 超过 5 分钟时间窗' }
      }

      const nonce = headers['wechatpay-nonce']
      const signature = headers['wechatpay-signature']
      if (!nonce || !signature) {
        return { valid: false, reason: 'wechatpay-nonce / wechatpay-signature 缺失' }
      }

      /* 验签：${ts}\n${nonce}\n${body}\n */
      if (!this.platformPublicKeyPem) {
        return {
          valid: false,
          reason: '未配置 WECHAT_PAY_V3_PLATFORM_PUBLIC_KEY（无法离线验签）'
        }
      }
      const verifyPayload = `${ts}\n${nonce}\n${body}\n`
      const ok = this.rsaVerifyBase64(verifyPayload, signature, this.platformPublicKeyPem)
      if (!ok) {
        return { valid: false, reason: '签名校验失败' }
      }

      /* 解密 resource */
      const parsed = JSON.parse(body) as {
        resource?: {
          ciphertext?: string
          nonce?: string
          associated_data?: string
          algorithm?: string
        }
      }
      if (!parsed.resource || !parsed.resource.ciphertext || !parsed.resource.nonce) {
        return { valid: false, reason: 'resource 缺失或格式错误' }
      }
      const plain = this.aes256GcmDecrypt(
        parsed.resource.ciphertext,
        parsed.resource.nonce,
        parsed.resource.associated_data ?? ''
      )
      const inner = JSON.parse(plain) as {
        out_trade_no?: string
        transaction_id?: string
        payer?: { openid?: string }
        amount?: { payer_total?: number; total?: number }
      }
      const orderNo = inner.out_trade_no ?? ''
      const transactionId = inner.transaction_id ?? ''
      const payerOpenId = inner.payer?.openid ?? ''
      const amount = inner.amount?.payer_total ?? inner.amount?.total ?? 0

      if (!orderNo) return { valid: false, reason: 'out_trade_no 缺失' }

      return {
        valid: true,
        resource: {
          orderNo,
          transactionId,
          payerOpenId,
          amount,
          raw: inner as unknown as Record<string, unknown>
        }
      }
    } catch (err) {
      this.logger.error(`[WechatPayV3Provider] verifyCallback 异常：${(err as Error).message}`)
      return { valid: false, reason: (err as Error).message }
    }
  }

  /* ============================================================================
   * 3. 订单查询
   * ============================================================================ */

  /**
   * 查询订单
   * 参数：orderNo 平台订单号
   * 返回值：{ status, transactionId? }
   */
  async queryOrder(orderNo: string): Promise<WechatPayQueryResult> {
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(`[WechatPayV3Provider] queryOrder no-op (disabled) orderNo=${orderNo}`)
      return { status: 'NOTPAY' }
    }
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(this.mchid)}`
    const json = await this.requestV3<{ trade_state?: string; transaction_id?: string }>(
      'GET',
      path,
      ''
    )
    return {
      status: json.trade_state ?? 'NOTPAY',
      transactionId: json.transaction_id
    }
  }

  /* ============================================================================
   * 4. 退款
   * ============================================================================ */

  /**
   * 申请退款
   * 参数：
   *   - refundNo          平台退款单号 → out_refund_no
   *   - orderNo           原平台订单号 → out_trade_no
   *   - refundAmountFen   本次退款金额（分）
   *   - totalAmountFen    原支付金额（分）
   * 返回值：{ refundId, status }
   */
  async refund(
    refundNo: string,
    orderNo: string,
    refundAmountFen: number,
    totalAmountFen: number
  ): Promise<WechatPayRefundResult> {
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(`[WechatPayV3Provider] refund no-op (disabled) refundNo=${refundNo}`)
      return { refundId: '', status: 'PROCESSING' }
    }

    const refundBn = new BigNumber(refundAmountFen)
    const totalBn = new BigNumber(totalAmountFen)
    if (
      !refundBn.isFinite() ||
      !refundBn.isInteger() ||
      refundBn.isLessThanOrEqualTo(0) ||
      !totalBn.isFinite() ||
      !totalBn.isInteger() ||
      totalBn.isLessThanOrEqualTo(0) ||
      refundBn.isGreaterThan(totalBn)
    ) {
      throw new Error(
        `[WechatPayV3Provider] refund 金额非法：refund=${refundAmountFen} total=${totalAmountFen}`
      )
    }

    const reqBody = {
      out_trade_no: orderNo,
      out_refund_no: refundNo,
      amount: {
        refund: refundBn.toNumber(),
        total: totalBn.toNumber(),
        currency: 'CNY'
      }
    }
    const path = '/v3/refund/domestic/refunds'
    const json = await this.requestV3<{ refund_id?: string; status?: string }>(
      'POST',
      path,
      JSON.stringify(reqBody)
    )
    return {
      refundId: json.refund_id ?? '',
      status: json.status ?? 'PROCESSING'
    }
  }

  /* ============================================================================
   * 内部工具
   * ============================================================================ */

  /**
   * V3 通用请求（GET / POST）
   * 流程：
   *   1) 拼装签名串：${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n
   *   2) RSA-SHA256 签名（商户私钥）→ base64
   *   3) Authorization 头：WECHATPAY2-SHA256-RSA2048 mchid="...",nonce_str="...",timestamp="...",serial_no="...",signature="..."
   *   4) fetch + 超时
   *
   * 注意：url 部分要包含 path + query（不含 host）
   */
  private async requestV3<T>(method: 'GET' | 'POST', path: string, body: string): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = this.shortNonce()
    const signPayload = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`
    const signature = this.rsaSignBase64(signPayload)

    const auth = [
      `mchid="${this.mchid}"`,
      `nonce_str="${nonce}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${this.serialNo}"`,
      `signature="${signature}"`
    ].join(',')

    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
    try {
      const resp = await fetch(url, {
        method,
        headers: {
          Authorization: `WECHATPAY2-SHA256-RSA2048 ${auth}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'o2o-server/wechat-pay-v3-self'
        },
        body: method === 'POST' ? body : undefined,
        signal: controller.signal
      })
      const text = await resp.text()
      if (resp.status >= 400) {
        throw new Error(`[WechatPayV3Provider] HTTP ${resp.status} ${path}：${text.slice(0, 500)}`)
      }
      if (!text) return {} as T
      return JSON.parse(text) as T
    } finally {
      clearTimeout(timer)
    }
  }

  /** RSA-SHA256 签名（商户私钥）→ base64 */
  private rsaSignBase64(payload: string): string {
    const signer = createSign('RSA-SHA256')
    signer.update(payload, 'utf8')
    signer.end()
    return signer.sign(this.privateKeyPem, 'base64')
  }

  /** RSA-SHA256 验签（平台公钥）；signature 为 base64 */
  private rsaVerifyBase64(
    payload: string,
    signatureB64: string,
    publicKeyPem: string | KeyObject
  ): boolean {
    try {
      const verifier = createVerify('RSA-SHA256')
      verifier.update(payload, 'utf8')
      verifier.end()
      return verifier.verify(publicKeyPem, signatureB64, 'base64')
    } catch (err) {
      this.logger.warn(`[WechatPayV3Provider] rsaVerify 异常：${(err as Error).message}`)
      return false
    }
  }

  /**
   * AES-256-GCM 解密回调 resource
   * 参数：
   *   - ciphertextB64   base64 密文（含 GCM tag 末 16 字节）
   *   - nonce           12 字节 ASCII 字符串（resource.nonce 原文）
   *   - aad             associated_data（可空字符串）
   * 返回值：解密后的明文 JSON 字符串
   */
  private aes256GcmDecrypt(ciphertextB64: string, nonce: string, aad: string): string {
    const key = Buffer.from(this.apiV3Key, 'utf8')
    if (key.length !== 32) {
      throw new Error('[WechatPayV3Provider] apiV3Key 必须为 32 字节（utf8）')
    }
    const cipherBuf = Buffer.from(ciphertextB64, 'base64')
    if (cipherBuf.length < 17) {
      throw new Error('[WechatPayV3Provider] 密文长度不足')
    }
    const authTag = cipherBuf.subarray(cipherBuf.length - 16)
    const encrypted = cipherBuf.subarray(0, cipherBuf.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'))
    decipher.setAuthTag(authTag)
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return plain.toString('utf8')
  }

  /** 16 hex 字符随机串 */
  private shortNonce(): string {
    return randomBytes(16).toString('hex')
  }

  /**
   * 仅供单测 / 集成测试使用：用商户公钥模拟微信平台加密一段 resource
   * （不会在生产路径调用）
   * 参数：
   *   - plaintext  明文（JSON 字符串）
   *   - nonce      12 字节 nonce
   *   - aad        associated_data
   * 返回值：base64 密文
   */
  encryptResourceForTest(plaintext: string, nonce: string, aad: string): string {
    const key = Buffer.from(this.apiV3Key, 'utf8')
    if (key.length !== 32) {
      throw new Error('[WechatPayV3Provider] apiV3Key 必须为 32 字节（utf8）')
    }
    const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'))
    cipher.setAAD(Buffer.from(aad, 'utf8'))
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return Buffer.concat([encrypted, authTag]).toString('base64')
  }
}
