/**
 * @file alipay.provider.ts
 * @stage P9/W3.C.2 (Sprint 3) — Alipay 真实 provider（envelope 风格手写，不依赖第三方包）
 * @desc 基于 Node 内置 crypto + 全局 fetch 自实现支付宝开放平台协议：
 *         - alipay.trade.page.pay（PC/H5 跳转 form）
 *         - 异步通知验签
 *         - alipay.trade.query
 *         - alipay.trade.refund
 *
 * 设计原则：
 *   - 任一关键 env 缺失 → enabled=false，所有方法 no-op + console.warn
 *   - 不引入 alipay-sdk / alipay-sdk-nodejs-all 等第三方包
 *   - 签名 / 验签使用 Node 内置 crypto（RSA-SHA256，俗称 RSA2）
 *   - HTTP 用全局 fetch（Node 18+ 内置）
 *
 * 路径：
 *   - 生产 gateway：https://openapi.alipay.com/gateway.do（默认）
 *   - 沙箱 gateway：https://openapi-sandbox.dl.alipaydev.com/gateway.do（推荐 .env 显式配）
 *
 * 金额：外部按"元"传入（支付宝标准单位是元，2 位小数）；BigNumber 防浮点抖动。
 *
 * @author Agent C (P9 Sprint 3)
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createSign, createVerify } from 'crypto'
import BigNumber from 'bignumber.js'

/* ============================================================================
 * 类型
 * ============================================================================ */

/** PC / H5 同步生成的 form HTML 与 GET URL（前端可二选一） */
export interface AlipayPagePayResult {
  formHtml: string
  payUrl: string
}

/** 异步通知验签结果 */
export interface AlipayAsyncNotifyResult {
  valid: boolean
  reason?: string
  orderNo?: string
  tradeNo?: string
  totalAmount?: string
  /** 原始 trade_status（如 TRADE_SUCCESS / TRADE_CLOSED / WAIT_BUYER_PAY 等） */
  tradeStatus?: string
}

/** 订单查询返回 */
export interface AlipayQueryResult {
  /** 原始 trade_status（如 TRADE_SUCCESS / WAIT_BUYER_PAY / TRADE_CLOSED 等） */
  tradeStatus: string
  tradeNo?: string
}

/** 退款返回 */
export interface AlipayRefundResult {
  tradeNo: string
  refundFee: string
}

/* ============================================================================
 * 内部常量
 * ============================================================================ */

/** 默认生产 gateway */
const DEFAULT_GATEWAY = 'https://openapi.alipay.com/gateway.do'

/** HTTP 请求超时 */
const HTTP_TIMEOUT_MS = 15000

/* ============================================================================
 * Provider
 * ============================================================================ */

@Injectable()
export class AlipayProvider {
  private readonly logger = new Logger(AlipayProvider.name)

  readonly enabled: boolean

  private readonly appId: string
  private readonly privateKey: string
  private readonly publicKey: string
  private readonly notifyUrl: string
  private readonly returnUrl: string
  private readonly gateway: string

  constructor(config: ConfigService) {
    this.appId = config.get<string>('ALIPAY_APP_ID', '')
    this.privateKey = config.get<string>('ALIPAY_PRIVATE_KEY', '')
    this.publicKey = config.get<string>('ALIPAY_PUBLIC_KEY', '')
    this.notifyUrl = config.get<string>('ALIPAY_NOTIFY_URL', '')
    this.returnUrl = config.get<string>('ALIPAY_RETURN_URL', '')
    this.gateway = config.get<string>('ALIPAY_GATEWAY', DEFAULT_GATEWAY)

    /* 关键 env 任一缺失 → 降级（公钥仅验签需要，非必需，但建议生产填齐） */
    this.enabled = Boolean(
      this.appId && this.privateKey && this.publicKey && this.notifyUrl && this.returnUrl
    )
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(
        '[AlipayProvider] disabled: 缺少 ALIPAY_APP_ID/PRIVATE_KEY/PUBLIC_KEY/NOTIFY_URL/RETURN_URL'
      )
    } else {
      this.logger.log(`[AlipayProvider] enabled appId=${this.appId} gateway=${this.gateway}`)
    }
  }

  /* ============================================================================
   * 1. PC / H5 同步生成跳转 form
   * ============================================================================ */

  /**
   * 生成 alipay.trade.page.pay form / URL
   * 参数：
   *   - orderNo       平台订单号 → out_trade_no
   *   - amountYuan    金额（元；string 形式如 '99.00'）
   *   - subject       商品名
   * 返回值：{ formHtml, payUrl }
   *
   * 备注：本接口为同步签名 + URL 拼装，不发起 HTTP（前端 form.submit() 跳转支付宝）
   */
  pagePay(orderNo: string, amountYuan: string, subject: string): AlipayPagePayResult {
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(`[AlipayProvider] pagePay no-op (disabled) orderNo=${orderNo}`)
      return { formHtml: '', payUrl: '' }
    }

    const amountBn = new BigNumber(amountYuan)
    if (!amountBn.isFinite() || amountBn.isLessThanOrEqualTo(0)) {
      throw new Error(`[AlipayProvider] amountYuan 非法：${amountYuan}`)
    }
    const totalAmount = amountBn.toFixed(2)

    const bizContent = JSON.stringify({
      out_trade_no: orderNo,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: totalAmount,
      subject
    })

    const publicParams: Record<string, string> = {
      app_id: this.appId,
      method: 'alipay.trade.page.pay',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: this.formatTimestamp(),
      version: '1.0',
      notify_url: this.notifyUrl,
      return_url: this.returnUrl,
      biz_content: bizContent
    }

    const signature = this.rsa2SignBase64(this.buildSignContent(publicParams))
    const allParams: Record<string, string> = { ...publicParams, sign: signature }

    /* 拼 GET URL（注意所有 value 必须 URL encode） */
    const qs = Object.entries(allParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    const payUrl = `${this.gateway}?${qs}`

    /* 拼 form HTML（前端 form.submit()） */
    const inputs = Object.entries(allParams)
      .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
      .join('')
    const formHtml = `<form id="alipay-form" action="${escapeHtml(this.gateway)}" method="POST" accept-charset="utf-8">${inputs}<input type="submit" value="支付" style="display:none;" /></form><script>document.getElementById('alipay-form').submit();</script>`

    return { formHtml, payUrl }
  }

  /* ============================================================================
   * 2. 异步通知验签
   * ============================================================================ */

  /**
   * 异步通知验签
   * 参数：
   *   - params 已 form 解析后的参数 Map（NestJS 默认 urlencoded 中间件解析后的 Body）
   * 返回值：AlipayAsyncNotifyResult
   *
   * 流程：
   *   1) 取出 sign + sign_type，剩余字段按 ASCII key 升序拼 ${key}=${value}&...
   *   2) 用支付宝公钥 RSA-SHA256 验签
   */
  async verifyAsyncNotify(params: Record<string, string>): Promise<AlipayAsyncNotifyResult> {
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn('[AlipayProvider] verifyAsyncNotify no-op (disabled)')
      return { valid: false, reason: 'disabled' }
    }

    try {
      const sign = params.sign
      if (!sign) return { valid: false, reason: 'sign 缺失' }
      const signType = params.sign_type ?? 'RSA2'
      if (signType !== 'RSA2') {
        return { valid: false, reason: `不支持的 sign_type=${signType}` }
      }

      const filtered: Record<string, string> = {}
      for (const [k, v] of Object.entries(params)) {
        if (k === 'sign' || k === 'sign_type') continue
        if (v === undefined || v === null || v === '') continue
        filtered[k] = v
      }
      const content = this.buildSignContent(filtered)
      const ok = this.rsa2VerifyBase64(content, sign)
      if (!ok) return { valid: false, reason: '验签失败' }

      return {
        valid: true,
        orderNo: params.out_trade_no,
        tradeNo: params.trade_no,
        totalAmount: params.total_amount,
        tradeStatus: params.trade_status
      }
    } catch (err) {
      this.logger.error(`[AlipayProvider] verifyAsyncNotify 异常：${(err as Error).message}`)
      return { valid: false, reason: (err as Error).message }
    }
  }

  /* ============================================================================
   * 3. 订单查询
   * ============================================================================ */

  /**
   * 查询订单（alipay.trade.query）
   * 参数：orderNo 平台订单号
   * 返回值：{ tradeStatus, tradeNo? }
   */
  async queryOrder(orderNo: string): Promise<AlipayQueryResult> {
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(`[AlipayProvider] queryOrder no-op (disabled) orderNo=${orderNo}`)
      return { tradeStatus: 'WAIT_BUYER_PAY' }
    }
    const bizContent = JSON.stringify({ out_trade_no: orderNo })
    const json = await this.callOpenApi<{
      alipay_trade_query_response?: { trade_status?: string; trade_no?: string; code?: string }
    }>('alipay.trade.query', bizContent)
    const resp = json.alipay_trade_query_response ?? {}
    return {
      tradeStatus: resp.trade_status ?? resp.code ?? 'UNKNOWN',
      tradeNo: resp.trade_no
    }
  }

  /* ============================================================================
   * 4. 退款
   * ============================================================================ */

  /**
   * 申请退款（alipay.trade.refund）
   * 参数：
   *   - refundNo          平台退款单号 → out_request_no
   *   - orderNo           原平台订单号 → out_trade_no
   *   - refundAmountYuan  退款金额（元）
   * 返回值：{ tradeNo, refundFee }
   */
  async refund(
    refundNo: string,
    orderNo: string,
    refundAmountYuan: string
  ): Promise<AlipayRefundResult> {
    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn(`[AlipayProvider] refund no-op (disabled) refundNo=${refundNo}`)
      return { tradeNo: '', refundFee: '0' }
    }

    const amountBn = new BigNumber(refundAmountYuan)
    if (!amountBn.isFinite() || amountBn.isLessThanOrEqualTo(0)) {
      throw new Error(`[AlipayProvider] refundAmountYuan 非法：${refundAmountYuan}`)
    }
    const refundAmount = amountBn.toFixed(2)
    const bizContent = JSON.stringify({
      out_trade_no: orderNo,
      out_request_no: refundNo,
      refund_amount: refundAmount
    })
    const json = await this.callOpenApi<{
      alipay_trade_refund_response?: {
        trade_no?: string
        refund_fee?: string
        fund_change?: string
        code?: string
        msg?: string
      }
    }>('alipay.trade.refund', bizContent)
    const resp = json.alipay_trade_refund_response ?? {}
    return {
      tradeNo: resp.trade_no ?? '',
      refundFee: resp.refund_fee ?? refundAmount
    }
  }

  /* ============================================================================
   * 内部工具
   * ============================================================================ */

  /**
   * 调用支付宝开放平台 API（POST application/x-www-form-urlencoded）
   * 参数：
   *   - method      接口名（如 'alipay.trade.refund'）
   *   - bizContent  业务参数 JSON 字符串
   * 返回值：解析后的 JSON
   */
  private async callOpenApi<T>(method: string, bizContent: string): Promise<T> {
    const publicParams: Record<string, string> = {
      app_id: this.appId,
      method,
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: this.formatTimestamp(),
      version: '1.0',
      biz_content: bizContent
    }
    const signature = this.rsa2SignBase64(this.buildSignContent(publicParams))
    const allParams: Record<string, string> = { ...publicParams, sign: signature }
    const formBody = Object.entries(allParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
    try {
      const resp = await fetch(this.gateway, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          'User-Agent': 'o2o-server/alipay-self'
        },
        body: formBody,
        signal: controller.signal
      })
      const text = await resp.text()
      if (resp.status >= 400) {
        throw new Error(`[AlipayProvider] HTTP ${resp.status} ${method}：${text.slice(0, 500)}`)
      }
      if (!text) return {} as T
      return JSON.parse(text) as T
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 拼装签名 / 验签内容：按 key ASCII 升序，${key}=${value}，& 拼接
   * 参数：params 仅参与签名的 kv（已剔除 sign / sign_type / 空值）
   * 返回值：拼装后的字符串
   */
  private buildSignContent(params: Record<string, string>): string {
    const keys = Object.keys(params).sort()
    return keys.map((k) => `${k}=${params[k]}`).join('&')
  }

  /** RSA-SHA256（RSA2）签名 → base64 */
  private rsa2SignBase64(content: string): string {
    const signer = createSign('RSA-SHA256')
    signer.update(content, 'utf8')
    signer.end()
    return signer.sign(this.privateKey, 'base64')
  }

  /** RSA-SHA256（RSA2）验签；signatureB64 = base64 */
  private rsa2VerifyBase64(content: string, signatureB64: string): boolean {
    try {
      const verifier = createVerify('RSA-SHA256')
      verifier.update(content, 'utf8')
      verifier.end()
      return verifier.verify(this.publicKey, signatureB64, 'base64')
    } catch (err) {
      this.logger.warn(`[AlipayProvider] rsa2Verify 异常：${(err as Error).message}`)
      return false
    }
  }

  /** yyyy-MM-dd HH:mm:ss（北京时间） */
  private formatTimestamp(): string {
    const beijing = new Date(Date.now() + 8 * 3600 * 1000)
    const y = beijing.getUTCFullYear()
    const mo = (beijing.getUTCMonth() + 1).toString().padStart(2, '0')
    const d = beijing.getUTCDate().toString().padStart(2, '0')
    const hh = beijing.getUTCHours().toString().padStart(2, '0')
    const mm = beijing.getUTCMinutes().toString().padStart(2, '0')
    const ss = beijing.getUTCSeconds().toString().padStart(2, '0')
    return `${y}-${mo}-${d} ${hh}:${mm}:${ss}`
  }
}

/** 简易 HTML 转义（form value 用） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
