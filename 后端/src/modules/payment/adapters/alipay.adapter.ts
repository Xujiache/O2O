/**
 * @file alipay.adapter.ts
 * @stage P4/T4.25（Sprint 4）
 * @desc 支付宝适配器：APP / WAP + 支付/退款回调验签
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * mock 优先策略（严守任务 §3.5/26 约束）：
 *   - env 缺失（thirdParty.alipayAppid + alipayPrivateKey 任一为空）→ mockMode=true
 *   - mockMode=true：
 *       createPay   返回 mock orderInfo（前端 SDK 直接吊起）
 *       refund      返回 mock outRefundNo + status='SUCCESS'（支付宝同步退款较多）
 *       verifyNotify 校验 ts/nonce 防重放后直接信任 body
 *       queryStatus 返回 NOTPAY
 *   - mockMode=false：核心 SDK 调用 throw（生产请补全 alipay-sdk-nodejs-all）
 *
 * 不引入 alipay-sdk，避免编造 API；签名工具用 Node 内置 crypto。
 *
 * mock body 简化为 {payNo, outTradeNo=trade_no, amount=total_amount, paidAt, tradeStatus, ts?, nonce?}
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, randomBytes } from 'crypto'
import {
  type CreatePayRequest,
  type CreatePayResult,
  type IPaymentAdapter,
  type NotifyRawInput,
  type RefundRequest,
  type RefundResult,
  type VerifyNotifyResult
} from './payment-adapter.interface'

/* ============================================================================
 * 内部常量
 * ============================================================================ */

const NOTIFY_TS_WINDOW_SECONDS = 300

/* ============================================================================
 * mock 模式回调 body 结构
 * ============================================================================ */

interface MockAlipayNotifyBody {
  payNo?: unknown
  outTradeNo?: unknown
  amount?: unknown
  paidAt?: unknown
  tradeStatus?: unknown
  ts?: unknown
  nonce?: unknown
}

/* ============================================================================
 * Adapter 实现
 * ============================================================================ */

@Injectable()
export class AlipayAdapter implements IPaymentAdapter {
  private readonly logger = new Logger(AlipayAdapter.name)

  readonly channelKey = 'alipay'

  readonly mockMode: boolean

  private readonly appId: string
  private readonly privateKey: string

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.appId = config.get<string>('thirdParty.alipayAppid', '')
    this.privateKey = config.get<string>('thirdParty.alipayPrivateKey', '')
    this.mockMode = !this.appId || !this.privateKey
    if (this.mockMode) {
      this.logger.warn('[Alipay] mock mode: 未配置 ALIPAY_APPID / ALIPAY_PRIVATE_KEY')
    }
  }

  /* ============================================================================
   * 1. 创建支付
   * ============================================================================ */

  async createPay(req: CreatePayRequest): Promise<CreatePayResult> {
    if (this.mockMode) {
      const tradeNo = `alipay-mock-trade-${Date.now()}-${this.shortNonce()}`

      /* APP / WAP 形式都是返回一个 orderInfo 字符串，前端 SDK 直接吊起 */
      const orderInfoStr = this.buildMockOrderInfo(req, tradeNo)
      const prepayParams: Record<string, unknown> = {
        orderInfo: orderInfoStr,
        tradeNo,
        channel: req.channel,
        clientType: req.clientType ?? null
      }

      const rawResponse: Record<string, unknown> = {
        mock: true,
        trade_no: tradeNo,
        out_trade_no: req.payNo
      }

      this.logger.log(
        `[Alipay/mock] createPay payNo=${req.payNo} amount=${req.amount} channel=${req.channel}`
      )
      return { prepayId: tradeNo, prepayParams, rawResponse }
    }

    /* TODO 真实接入：alipay-sdk-nodejs-all
     * - alipay.trade.app.pay / alipay.trade.wap.pay
     * - 签名 RSA2（SHA256withRSA），用 thirdParty.alipayPrivateKey
     * - 返回 orderInfo（已签名 query string）
     */
    throw new Error('[Alipay] 真实接入未实现：请配置 mock 或在 P9 阶段补全 alipay-sdk-nodejs-all')
  }

  /* ============================================================================
   * 2. 查询状态
   * ============================================================================ */

  async queryStatus(payNo: string): Promise<{
    tradeStatus: 'SUCCESS' | 'FAIL' | 'CLOSED' | 'NOTPAY'
    outTradeNo?: string
    paidAt?: number
  }> {
    if (this.mockMode) {
      this.logger.debug(`[Alipay/mock] queryStatus payNo=${payNo} → NOTPAY`)
      return { tradeStatus: 'NOTPAY' }
    }
    throw new Error('[Alipay] queryStatus 真实接入未实现')
  }

  /* ============================================================================
   * 3. 退款
   * ============================================================================ */

  async refund(req: RefundRequest): Promise<RefundResult> {
    if (this.mockMode) {
      const outRefundNo = `alipay-refund-mock-${Date.now()}-${this.shortNonce()}`
      this.logger.log(
        `[Alipay/mock] refund refundNo=${req.refundNo} payNo=${req.payNo} amount=${req.refundAmount}`
      )
      /* 支付宝退款 alipay.trade.refund 同步返回结果较多，mock 直接成功，但仍走 refund-notify 闭环 */
      return {
        outRefundNo,
        status: 'PROCESSING',
        rawResponse: {
          mock: true,
          out_refund_no: outRefundNo,
          refund_no: req.refundNo,
          status: 'PROCESSING'
        }
      }
    }
    throw new Error(
      '[Alipay] refund 真实接入未实现：请配置 mock 或在 P9 阶段补全 alipay.trade.refund'
    )
  }

  /* ============================================================================
   * 4. 回调验签
   * ============================================================================ */

  verifyNotify(input: NotifyRawInput): VerifyNotifyResult {
    if (this.mockMode) {
      const body = input.body
      if (!body || typeof body !== 'object') {
        return { ok: false, reason: 'body 不是对象' }
      }
      const data = body as MockAlipayNotifyBody

      if (data.ts !== undefined) {
        const ts = Number(data.ts)
        if (!Number.isFinite(ts)) return { ok: false, reason: 'ts 非数字' }
        const now = Math.floor(Date.now() / 1000)
        if (Math.abs(now - ts) > NOTIFY_TS_WINDOW_SECONDS) {
          return { ok: false, reason: 'ts 超过 5 分钟时间窗' }
        }
      }

      const payNo = typeof data.payNo === 'string' ? data.payNo : ''
      const outTradeNo = typeof data.outTradeNo === 'string' ? data.outTradeNo : ''
      const amount = typeof data.amount === 'string' ? data.amount : ''
      const paidAt =
        typeof data.paidAt === 'number' && Number.isFinite(data.paidAt) ? data.paidAt : Date.now()
      const tradeStatusRaw = typeof data.tradeStatus === 'string' ? data.tradeStatus : 'SUCCESS'
      const tradeStatus: 'SUCCESS' | 'FAIL' | 'CLOSED' =
        tradeStatusRaw === 'FAIL' ? 'FAIL' : tradeStatusRaw === 'CLOSED' ? 'CLOSED' : 'SUCCESS'

      if (!payNo) return { ok: false, reason: 'payNo 缺失' }
      if (!amount) return { ok: false, reason: 'amount 缺失' }

      return {
        ok: true,
        payload: {
          outTradeNo: outTradeNo || `alipay-mock-tx-${payNo}`,
          payNo,
          amount,
          paidAt,
          tradeStatus,
          raw: data as unknown as Record<string, unknown>
        }
      }
    }

    /* TODO 真实接入（P9）：
     * 1) 解析 form-urlencoded body 转 Map
     * 2) 校验 timestamp 5 分钟内
     * 3) 取出 sign + sign_type，剩余字段按 ASCII 排序拼 querystring
     * 4) 用支付宝公钥 RSA2 验签
     * 5) 解析 trade_status / total_amount / out_trade_no
     */
    return { ok: false, reason: '真实回调验签未实现，请在 P9 接入' }
  }

  /* ============================================================================
   * 内部工具
   * ============================================================================ */

  /** 构造 mock orderInfo 字符串（与真实 query string 形态接近） */
  private buildMockOrderInfo(req: CreatePayRequest, tradeNo: string): string {
    const params: Record<string, string> = {
      app_id: this.appId || 'mock-appid',
      method: req.clientType === 'wap' ? 'alipay.trade.wap.pay' : 'alipay.trade.app.pay',
      out_trade_no: req.payNo,
      total_amount: req.amount,
      subject: req.description ?? `订单 ${req.orderNo}`,
      timestamp: new Date().toISOString(),
      trade_no: tradeNo
    }
    /* 拼装签名 mock：HMAC-SHA256（不是真实 RSA2，仅占位） */
    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')
    const sign = createHmac('sha256', this.privateKey || 'mock')
      .update(queryString)
      .digest('hex')
    return `${queryString}&sign=${sign}`
  }

  /** 8 字节随机串（hex 16 位） */
  private shortNonce(): string {
    return randomBytes(8).toString('hex')
  }
}
