/**
 * @file wx-pay.adapter.ts
 * @stage P4/T4.24（Sprint 4）
 * @desc 微信支付 V3 适配器：JSAPI / APP / Native + 支付/退款回调验签
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * mock 优先策略（严守任务 §3.5/26 约束）：
 *   - env 缺失（thirdParty.wechatPayMchid + wechatPayApiV3Key 任一为空）→ mockMode=true
 *   - mockMode=true：
 *       createPay   返回 mock prepay_id + mock 唤起参数
 *       refund      返回 mock outRefundNo + status='PROCESSING'
 *       verifyNotify 校验 ts/nonce 防重放后直接信任 body（用于联调）
 *       queryStatus 返回 NOTPAY（业务由测试或对账兜底）
 *   - mockMode=false：核心 SDK 调用 throw SYSTEM_CONFIG_MISSING（生产请补全真实 SDK）
 *
 * 不引入 wechatpay-axios-plugin，避免编造 API；签名工具用 Node 内置 crypto。
 *
 * Headers（V3 真实回调）：
 *   - Wechatpay-Signature
 *   - Wechatpay-Timestamp
 *   - Wechatpay-Nonce
 *   - Wechatpay-Serial
 *   body: { resource: { ciphertext, nonce, associated_data, algorithm } }
 *
 * mock body 简化为 { payNo, outTradeNo, amount, paidAt, tradeStatus, ts?, nonce? }
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

/** 通信防重放窗口：5 分钟 */
const NOTIFY_TS_WINDOW_SECONDS = 300

/** mock 模式响应延迟（ms），便于联调时模拟真实网络抖动 */
const MOCK_DELAY_MS = 0

/* ============================================================================
 * mock 模式回调 body 结构（简化版）
 * ============================================================================ */

interface MockWxNotifyBody {
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
export class WxPayAdapter implements IPaymentAdapter {
  private readonly logger = new Logger(WxPayAdapter.name)

  readonly channelKey = 'wxpay'

  readonly mockMode: boolean

  /** 商户号（生产环境必填） */
  private readonly mchid: string
  /** API V3 密钥（用于 AES-GCM 解密回调 + HMAC-SHA256 签名） */
  private readonly apiV3Key: string

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.mchid = config.get<string>('thirdParty.wechatPayMchid', '')
    this.apiV3Key = config.get<string>('thirdParty.wechatPayApiV3Key', '')
    this.mockMode = !this.mchid || !this.apiV3Key
    if (this.mockMode) {
      this.logger.warn('[WxPay] mock mode: 未配置 WECHAT_PAY_MCHID / WECHAT_PAY_APIV3_KEY')
    }
  }

  /* ============================================================================
   * 1. 创建支付
   * ============================================================================ */

  async createPay(req: CreatePayRequest): Promise<CreatePayResult> {
    if (this.mockMode) {
      if (MOCK_DELAY_MS > 0) await this.sleep(MOCK_DELAY_MS)
      const prepayId = `wx-mock-prepay-${Date.now()}-${this.shortNonce()}`
      const timeStamp = Math.floor(Date.now() / 1000).toString()
      const nonceStr = this.shortNonce()

      /* 小程序 wx.requestPayment 入参（mock 数值，前端可看到结构是否一致） */
      const prepayParams: Record<string, unknown> = {
        appId: 'mock-appid',
        timeStamp,
        nonceStr,
        package: `prepay_id=${prepayId}`,
        signType: 'RSA',
        paySign: this.hmacSha256(`${nonceStr}.${timeStamp}.${prepayId}`, this.apiV3Key || 'mock')
      }

      const rawResponse: Record<string, unknown> = {
        prepay_id: prepayId,
        mock: true,
        channel: req.channel,
        clientType: req.clientType ?? null
      }

      this.logger.log(
        `[WxPay/mock] createPay payNo=${req.payNo} amount=${req.amount} channel=${req.channel}`
      )
      return { prepayId, prepayParams, rawResponse }
    }

    /* TODO 真实接入：axios 调 V3 /v3/pay/transactions/{jsapi|app|native}
     * 1) 装配 body：{ appid, mchid, description, out_trade_no=payNo, notify_url,
     *    amount: { total: 元 → 分 }, payer: { openid }（jsapi）}
     * 2) 计算签名：HMAC-SHA256（mchid + serial + ts + nonce + body）
     * 3) HTTP POST + Authorization 头
     * 4) 解析 prepay_id，按客户端类型生成前端唤起参数
     * 暂以 SYSTEM_CONFIG_MISSING 阻断生产路径，避免编造 SDK
     */
    throw new Error(
      '[WxPay] 真实接入未实现：请配置 mock 或在 P9 阶段补全 wechatpay-axios-plugin / 自实现 SDK'
    )
  }

  /* ============================================================================
   * 2. 查询支付状态
   * ============================================================================ */

  async queryStatus(payNo: string): Promise<{
    tradeStatus: 'SUCCESS' | 'FAIL' | 'CLOSED' | 'NOTPAY'
    outTradeNo?: string
    paidAt?: number
  }> {
    if (this.mockMode) {
      this.logger.debug(`[WxPay/mock] queryStatus payNo=${payNo} → NOTPAY`)
      return { tradeStatus: 'NOTPAY' }
    }
    throw new Error('[WxPay] queryStatus 真实接入未实现')
  }

  /* ============================================================================
   * 3. 退款
   * ============================================================================ */

  async refund(req: RefundRequest): Promise<RefundResult> {
    if (this.mockMode) {
      if (MOCK_DELAY_MS > 0) await this.sleep(MOCK_DELAY_MS)
      const outRefundNo = `wx-refund-mock-${Date.now()}-${this.shortNonce()}`
      this.logger.log(
        `[WxPay/mock] refund refundNo=${req.refundNo} payNo=${req.payNo} amount=${req.refundAmount}`
      )
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
      '[WxPay] refund 真实接入未实现：请配置 mock 或在 P9 阶段补全 V3 /v3/refund/domestic/refunds'
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
      const data = body as MockWxNotifyBody

      /* 防重放：mock body 也接受 ts + nonce 字段；存在则校验时间窗 */
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
          outTradeNo: outTradeNo || `wx-mock-tx-${payNo}`,
          payNo,
          amount,
          paidAt,
          tradeStatus,
          raw: data as unknown as Record<string, unknown>
        }
      }
    }

    /* TODO 真实接入（P9）：
     * 1) 校验 Wechatpay-Timestamp 在 5 分钟内
     * 2) 拼装签名串 ts\nnonce\nbody\n
     * 3) 用平台证书公钥 RSA 验签 Wechatpay-Signature（base64）
     * 4) 用 apiV3Key AES-256-GCM 解密 resource.ciphertext（associated_data + nonce）
     * 5) 解析明文 JSON → 标准化 payload
     */
    return { ok: false, reason: '真实回调验签未实现，请在 P9 接入' }
  }

  /* ============================================================================
   * 内部工具
   * ============================================================================ */

  /** HMAC-SHA256（用作 mock paySign + 真实签名共享方法） */
  private hmacSha256(payload: string, key: string): string {
    return createHmac('sha256', key).update(payload).digest('hex')
  }

  /** 8 字节随机串（hex 16 位） */
  private shortNonce(): string {
    return randomBytes(8).toString('hex')
  }

  /** 异步延迟 */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
