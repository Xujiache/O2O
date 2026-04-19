/**
 * @file payment-adapter.interface.ts
 * @stage P4/T4.24 + T4.25 + T4.26（Sprint 4）
 * @desc 支付适配器统一接口（IPaymentAdapter）+ 工厂注入 token
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 设计目标：
 *   - 微信支付 V3、支付宝、余额三套实现，对外暴露同一接口
 *   - PaymentService 不感知具体渠道；按 PayMethod 动态选取 adapter
 *   - 回调 controller（@Public）通过 verifyNotify 验签后委派 PaymentStateMachine 切流转
 *
 * 注入：
 *   - PAYMENT_ADAPTER_REGISTRY token 暴露 Map<PayMethod, IPaymentAdapter>
 *   - PaymentService constructor 注入该 Map，按 method 取 adapter
 */

import type { PayChannel, PayMethod, PayerClientType } from '../types/payment.types'

/* ============================================================================
 * 创建支付入参
 * ============================================================================ */

/**
 * 创建支付请求
 *
 * 字段：
 *   - payNo            平台支付单号（28 位，由 PaymentService 生成）
 *   - orderNo          关联订单号（18 位）
 *   - orderType        订单类型：1 外卖 / 2 跑腿
 *   - userId           付款用户 ID（雪花字符串）
 *   - amount           支付金额（string + 两位小数）
 *   - method           支付方式
 *   - clientType       唤起方式（jsapi/app/native/wap）；method=BALANCE 可空
 *   - channel          channel 字面量（resolvePayChannel 推导）
 *   - notifyUrl        三方回调地址（adapter 写入对应平台请求体）
 *   - clientIp         客户端 IP（可选，部分渠道必传）
 *   - description      商品描述（可选）
 *   - openId           微信 jsapi 必传（小程序 / 公众号 openId）
 */
export interface CreatePayRequest {
  payNo: string
  orderNo: string
  orderType: number
  userId: string
  amount: string
  method: PayMethod
  clientType?: PayerClientType
  channel: PayChannel
  notifyUrl: string
  clientIp?: string
  description?: string
  openId?: string
}

/* ============================================================================
 * 创建支付返回
 * ============================================================================ */

/**
 * 创建支付返回
 *
 * 字段：
 *   - prepayId      三方预支付 ID（微信 prepay_id / 支付宝 trade_no）
 *   - prepayParams  前端唤起参数（小程序 wx.requestPayment / 支付宝 SDK 入参，结构因渠道而异）
 *   - rawResponse   三方原始返回（脱敏后写入 payment_record.raw_response）
 *   - alreadyPaid   余额支付直接成功时为 true，PaymentService 立即转 SUCCESS
 */
export interface CreatePayResult {
  prepayId: string
  prepayParams: Record<string, unknown>
  rawResponse: Record<string, unknown>
  alreadyPaid?: boolean
}

/* ============================================================================
 * 验签结果（回调）
 * ============================================================================ */

/**
 * 回调验签 + 解密结果
 *
 * 字段：
 *   - ok        验签是否通过
 *   - reason    失败原因（仅 ok=false 时有意义；用于 controller 返回排查）
 *   - payload   解密 / 解析后的标准化业务字段；ok=true 必须有
 *
 * payload 字段：
 *   - outTradeNo   三方交易号（微信 transaction_id / 支付宝 trade_no）
 *   - payNo        平台支付单号（透传）
 *   - amount       三方实付金额（string）
 *   - paidAt       三方支付完成时刻（ms 时间戳）
 *   - tradeStatus  规范化后的状态：SUCCESS / FAIL / CLOSED
 *   - raw          三方原始报文（写入 payment_record.raw_response）
 */
export interface VerifyNotifyPayload {
  outTradeNo: string
  payNo: string
  amount: string
  paidAt: number
  tradeStatus: 'SUCCESS' | 'FAIL' | 'CLOSED'
  raw: Record<string, unknown>
}

export interface VerifyNotifyResult {
  ok: boolean
  reason?: string
  payload?: VerifyNotifyPayload
}

/* ============================================================================
 * 退款入参 / 出参
 * ============================================================================ */

/**
 * 退款请求
 *
 * 字段：
 *   - refundNo      平台退款单号（28 位）
 *   - payNo         原平台支付单号
 *   - outTradeNo    原三方交易号（首次回调到达后回填，可能为 null）
 *   - totalAmount   原支付金额（string；微信退款必传）
 *   - refundAmount  本次退款金额（string）
 *   - reason        退款原因
 *   - notifyUrl     退款回调地址
 */
export interface RefundRequest {
  refundNo: string
  payNo: string
  outTradeNo: string | null
  totalAmount: string
  refundAmount: string
  reason: string
  notifyUrl: string
}

/**
 * 退款返回
 *
 * 字段：
 *   - outRefundNo  三方退款单号（写入 refund_record.out_refund_no）
 *   - status       规范化状态：PROCESSING（同步成功，等待回调）/ SUCCESS（同步即成功，余额）/ FAIL
 *   - rawResponse  三方原始返回
 */
export interface RefundResult {
  outRefundNo: string
  status: 'PROCESSING' | 'SUCCESS' | 'FAIL'
  rawResponse: Record<string, unknown>
}

/* ============================================================================
 * 通用回调验签入参
 * ============================================================================ */

/**
 * 回调原始报文（headers + body）
 *
 * adapter 自行解析 headers 中签名头 + body 中加密报文。
 */
export interface NotifyRawInput {
  headers: Record<string, string | string[] | undefined>
  body: unknown
}

/* ============================================================================
 * 适配器统一接口
 * ============================================================================ */

/**
 * 支付适配器
 *
 * 4 大接口：
 *   - createPay      创建支付（返回前端唤起参数）
 *   - queryStatus    查询支付状态（被动对账 / 异常修复）
 *   - refund         发起退款
 *   - verifyNotify   回调验签 + 解密（支付 / 退款共用，由 adapter 内部判定）
 */
export interface IPaymentAdapter {
  /**
   * 渠道顶层标识（'wxpay' / 'alipay' / 'balance'）
   * 用途：日志 / 对账 / refund-notify 路由参数
   */
  readonly channelKey: string

  /**
   * 是否处于 mock 模式（env 配置缺失时为 true）
   */
  readonly mockMode: boolean

  /**
   * 创建支付
   * 参数：req CreatePayRequest
   * 返回值：CreatePayResult
   */
  createPay(req: CreatePayRequest): Promise<CreatePayResult>

  /**
   * 查询支付状态（被动同步用，本期最小实现可仅 mock）
   * 参数：payNo 平台支付单号
   * 返回值：{ tradeStatus, outTradeNo?, paidAt? }
   */
  queryStatus(payNo: string): Promise<{
    tradeStatus: 'SUCCESS' | 'FAIL' | 'CLOSED' | 'NOTPAY'
    outTradeNo?: string
    paidAt?: number
  }>

  /**
   * 发起退款
   * 参数：req RefundRequest
   * 返回值：RefundResult
   */
  refund(req: RefundRequest): Promise<RefundResult>

  /**
   * 回调验签 + 解析
   * 参数：input NotifyRawInput
   * 返回值：VerifyNotifyResult
   */
  verifyNotify(input: NotifyRawInput): VerifyNotifyResult
}

/* ============================================================================
 * 注入 token
 * ============================================================================ */

/** PAYMENT_ADAPTER_REGISTRY：Map<PayMethod, IPaymentAdapter> */
export const PAYMENT_ADAPTER_REGISTRY = Symbol('PAYMENT_ADAPTER_REGISTRY')
