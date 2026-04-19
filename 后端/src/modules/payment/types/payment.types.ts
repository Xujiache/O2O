/**
 * @file payment.types.ts
 * @stage P4/T4.24~T4.29（Sprint 4）
 * @desc 支付域共享类型：PayMethod / PayStatus / PayChannel / PayerClientType / PaymentEventName
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 与 D5 数据库 payment_record / refund_record 对齐：
 *   - PayMethod   →  payment_record.pay_method  (1 微信 / 2 支付宝 / 3 余额 / 4 混合)
 *   - PayStatus   →  payment_record.status      (0 创建 / 1 支付中 / 2 成功 / 3 失败 / 4 关闭 / 5 已退款)
 *   - RefundStatus→  refund_record.status       (0 申请 / 1 处理中 / 2 成功 / 3 失败)
 *
 * 事件 PaymentEventName：状态机 transit + 事件总线复用同一字面量
 *   - PaymentCreated  : 创建支付单
 *   - PaymentSucceed  : 支付成功（回调到达后）
 *   - PaymentFailed   : 支付失败
 *   - PaymentClosed   : 关闭支付单（用户取消 / 超时）
 *   - RefundCreated   : 退款单创建
 *   - RefundSucceed   : 退款成功（回调到达后）
 *   - RefundFailed    : 退款失败
 */

/* ============================================================================
 * 1. 支付方式（与 payment_record.pay_method 对齐）
 * ============================================================================ */

/** 支付方式枚举（数值 = DB 字段值） */
export enum PayMethod {
  /** 微信支付 */
  WX_PAY = 1,
  /** 支付宝 */
  ALIPAY = 2,
  /** 余额支付 */
  BALANCE = 3,
  /** 混合支付（暂未实现） */
  MIXED = 4
}

/* ============================================================================
 * 2. 支付状态（与 payment_record.status 对齐）
 * ============================================================================ */

/** 支付状态枚举 */
export enum PayStatus {
  /** 创建（订单已生成支付单，尚未唤起） */
  CREATED = 0,
  /** 支付中（已唤起，等待回调） */
  PAYING = 1,
  /** 成功（回调到达） */
  SUCCESS = 2,
  /** 失败（回调失败） */
  FAILED = 3,
  /** 关闭（用户取消 / 超时） */
  CLOSED = 4,
  /** 已退款（部分 / 全额） */
  REFUNDED = 5
}

/* ============================================================================
 * 3. 退款状态（与 refund_record.status 对齐）
 * ============================================================================ */

/** 退款状态枚举 */
export enum RefundStatus {
  /** 申请（待提交三方） */
  APPLIED = 0,
  /** 处理中（已提交三方，等待回调） */
  PROCESSING = 1,
  /** 成功 */
  SUCCESS = 2,
  /** 失败 */
  FAILED = 3
}

/* ============================================================================
 * 4. 支付渠道（payment_record.channel 详细字段；前端唤起方式）
 * ============================================================================ */

/** 支付渠道详细字段（写入 payment_record.channel） */
export type PayChannel =
  | 'wxpay_jsapi'
  | 'wxpay_app'
  | 'wxpay_native'
  | 'alipay_app'
  | 'alipay_wap'
  | 'balance'

/** 客户端类型（驱动 adapter 选择具体调用方式） */
export type PayerClientType = 'jsapi' | 'app' | 'native' | 'wap'

/* ============================================================================
 * 5. 第三方渠道标识（reconciliation.channel / refund-notify channel 路由参数）
 * ============================================================================ */

/** 支付渠道顶层标识 */
export type PayChannelKey = 'wxpay' | 'alipay'

/* ============================================================================
 * 6. 事件名字面量（状态机 transit + 事件总线 publish 复用）
 * ============================================================================ */

/** 业务事件名字面量类型 */
export type PaymentEventName =
  | 'PaymentCreated'
  | 'PaymentSucceed'
  | 'PaymentFailed'
  | 'PaymentClosed'
  | 'RefundCreated'
  | 'RefundSucceed'
  | 'RefundFailed'

/** 事件名常量数组（runtime 校验 / 测试穷举） */
export const PAYMENT_EVENT_NAMES: ReadonlyArray<PaymentEventName> = [
  'PaymentCreated',
  'PaymentSucceed',
  'PaymentFailed',
  'PaymentClosed',
  'RefundCreated',
  'RefundSucceed',
  'RefundFailed'
]

/* ============================================================================
 * 7. PayMethod → PayChannel 映射（Service 层兜底，避免业务自由拼）
 * ============================================================================ */

/**
 * 由 (PayMethod, PayerClientType) 推导 channel 字面量
 * 参数：method 支付方式；clientType 唤起方式（仅微信/支付宝有意义）
 * 返回值：channel 字面量；method=BALANCE 固定 'balance'，未匹配组合返回 null
 */
export function resolvePayChannel(
  method: PayMethod,
  clientType?: PayerClientType
): PayChannel | null {
  if (method === PayMethod.BALANCE) return 'balance'
  if (method === PayMethod.WX_PAY) {
    if (clientType === 'jsapi') return 'wxpay_jsapi'
    if (clientType === 'app') return 'wxpay_app'
    if (clientType === 'native') return 'wxpay_native'
    return null
  }
  if (method === PayMethod.ALIPAY) {
    if (clientType === 'app') return 'alipay_app'
    if (clientType === 'wap') return 'alipay_wap'
    return null
  }
  return null
}

/* ============================================================================
 * 8. 状态机变迁表（const map，运行时校验）
 * ============================================================================ */

/**
 * 允许的状态机变迁（from → toSet）
 *
 * 0 创建 → 1 支付中（adapter 已成功唤起，等待回调）
 * 0 创建 → 2 成功（余额支付一步到位 / 测试 mock）
 * 0 创建 → 4 关闭（用户取消 / 超时关单）
 * 1 支付中 → 2 成功（回调到达）
 * 1 支付中 → 3 失败（回调失败）
 * 1 支付中 → 4 关闭（超时关单 / 用户主动取消）
 * 2 成功 → 5 已退款（首次 / 部分退款回调到达后）
 * 5 已退款 → 5 已退款（部分退款多次到账，仍维持 5）
 */
export const PAYMENT_TRANSITION_MAP: Readonly<Record<PayStatus, ReadonlyArray<PayStatus>>> = {
  [PayStatus.CREATED]: [PayStatus.PAYING, PayStatus.SUCCESS, PayStatus.CLOSED],
  [PayStatus.PAYING]: [PayStatus.SUCCESS, PayStatus.FAILED, PayStatus.CLOSED],
  [PayStatus.SUCCESS]: [PayStatus.REFUNDED],
  [PayStatus.FAILED]: [],
  [PayStatus.CLOSED]: [],
  [PayStatus.REFUNDED]: [PayStatus.REFUNDED]
}

/**
 * 支付状态机事件 → 目标状态（transit 入参用事件名，service 内部转目标状态）
 */
export const PAYMENT_EVENT_TO_STATUS: Readonly<Record<PaymentEventName, PayStatus | null>> = {
  PaymentCreated: PayStatus.CREATED,
  PaymentSucceed: PayStatus.SUCCESS,
  PaymentFailed: PayStatus.FAILED,
  PaymentClosed: PayStatus.CLOSED,
  /* 退款类事件不直接驱动 payment_record 状态变迁；refund.service 内单独转 5 */
  RefundCreated: null,
  RefundSucceed: PayStatus.REFUNDED,
  RefundFailed: null
}
