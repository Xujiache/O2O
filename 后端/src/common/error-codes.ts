/**
 * @file error-codes.ts
 * @stage P3/T3.1
 * @desc 全平台业务错误码常量与中文说明（对齐 DESIGN_P3 §7.2）
 * @author 员工 A
 *
 * 编码段位规范（DESIGN_P3 §7.2）：
 *   0      —— 成功
 *   10xxx  —— 参数 / 业务校验错误
 *   20xxx  —— 认证 / 权限错误
 *   30xxx  —— 限流 / 频控错误
 *   40xxx  —— 第三方依赖异常
 *   50xxx  —— 系统内部错误
 */

/**
 * 业务错误码与默认中文消息字典
 * 用途：throw new BusinessException(BizErrorCode.AUTH_TOKEN_INVALID)
 *      或 ApiResponse.fail(BizErrorCode.PARAM_INVALID, '可选自定义 message')
 */
export const BizErrorCode = {
  /* ======== 0 成功 ======== */
  OK: 0,

  /* ======== 10xxx 参数 / 业务 ======== */
  PARAM_INVALID: 10001,
  PARAM_MISSING: 10002,
  BIZ_RESOURCE_NOT_FOUND: 10010,
  BIZ_DATA_CONFLICT: 10011,
  BIZ_OPERATION_FORBIDDEN: 10012,
  BIZ_STATE_INVALID: 10013,

  /* ===== 101xx 商品与配送（DESIGN_P4 §十一）===== */
  BIZ_DELIVERY_OUT_OF_RANGE: 10101 /* 配送范围外 */,
  BIZ_BELOW_MIN_ORDER_AMOUNT: 10102 /* 低于起送价 */,

  /* ===== 102xx 库存与商品状态 ===== */
  BIZ_STOCK_INSUFFICIENT: 10200 /* 库存不足 */,
  BIZ_PRODUCT_OFFLINE: 10201 /* 商品已下架 */,
  BIZ_SHOP_CLOSED: 10202 /* 店铺打烊 */,

  /* ===== 103xx 订单 ===== */
  BIZ_ORDER_NOT_FOUND: 10300 /* 订单不存在 */,
  BIZ_ORDER_STATE_NOT_ALLOWED: 10301 /* 状态不允许该操作 */,
  BIZ_ORDER_NOT_OWNED: 10302 /* 非本人订单 */,

  /* ===== 104xx 支付 ===== */
  BIZ_PAYMENT_FAILED: 10400 /* 支付失败 */,
  BIZ_PAYMENT_DUPLICATED: 10401 /* 重复支付 */,
  BIZ_BALANCE_INSUFFICIENT: 10402 /* 余额不足 */,

  /* ===== 105xx 退款 ===== */
  BIZ_REFUND_FAILED: 10500 /* 退款失败 */,
  BIZ_REFUND_OVER_LIMIT: 10501 /* 超出可退额 */,

  /* ===== 106xx 派单 ===== */
  BIZ_NO_AVAILABLE_RIDER: 10600 /* 无可派骑手 */,
  BIZ_DISPATCH_TIMEOUT: 10601 /* 派单超时 */,

  /* ===== 107xx 优惠券 ===== */
  BIZ_COUPON_NOT_APPLICABLE: 10700 /* 优惠券不适用 */,
  BIZ_COUPON_USED: 10701 /* 已使用 */,
  BIZ_COUPON_EXPIRED: 10702 /* 已过期 */,

  /* ===== 108xx 评价与售后 ===== */
  BIZ_REVIEW_OUT_OF_PERIOD: 10800 /* 评价不在有效期 */,

  /* ======== 20xxx 认证 / 权限 ======== */
  AUTH_TOKEN_MISSING: 20001,
  AUTH_TOKEN_INVALID: 20002,
  AUTH_PERMISSION_DENIED: 20003,
  AUTH_USER_TYPE_MISMATCH: 20004,
  AUTH_TOKEN_EXPIRED: 20005,
  AUTH_REFRESH_TOKEN_INVALID: 20006,
  AUTH_LOGIN_FAILED: 20010,
  AUTH_LOGIN_LOCKED: 20011,
  AUTH_USER_NOT_FOUND: 20012,
  AUTH_PASSWORD_INCORRECT: 20013,
  AUTH_SMS_CODE_INVALID: 20014,
  AUTH_SMS_CODE_EXPIRED: 20015,
  AUTH_ACCOUNT_DISABLED: 20020,
  AUTH_ACCOUNT_BLACKLISTED: 20021,
  AUTH_SIGN_INVALID: 20030,
  AUTH_NONCE_REPLAY: 20031,
  AUTH_TIMESTAMP_EXPIRED: 20032,

  /* ======== 30xxx 限流 / 频控 ======== */
  RATE_LIMIT_EXCEEDED: 30001,
  SMS_SEND_TOO_FREQUENT: 30002,
  IDEMPOTENT_DUPLICATE: 30003,

  /* ======== 40xxx 第三方异常 ======== */
  WX_API_ERROR: 40001,
  SMS_PROVIDER_ERROR: 40002,
  PUSH_PROVIDER_ERROR: 40003,
  MAP_PROVIDER_ERROR: 40004,
  STORAGE_PROVIDER_ERROR: 40005,
  PAYMENT_PROVIDER_ERROR: 40006,

  /* ======== 50xxx 系统错误 ======== */
  SYSTEM_INTERNAL_ERROR: 50001,
  SYSTEM_TIMEOUT: 50002,
  SYSTEM_DB_ERROR: 50003,
  SYSTEM_REDIS_ERROR: 50004,
  SYSTEM_MQ_ERROR: 50005,
  SYSTEM_CONFIG_MISSING: 50006
} as const

/** BizErrorCode 数值类型联合 */
export type BizErrorCodeValue = (typeof BizErrorCode)[keyof typeof BizErrorCode]

/**
 * 错误码 → 默认中文消息映射
 * 用途：HttpExceptionFilter / BusinessException 在未传 message 时兜底取该字典
 */
export const BizErrorMessage: Record<number, string> = {
  [BizErrorCode.OK]: 'ok',

  [BizErrorCode.PARAM_INVALID]: '参数不合法',
  [BizErrorCode.PARAM_MISSING]: '缺少必要参数',
  [BizErrorCode.BIZ_RESOURCE_NOT_FOUND]: '资源不存在',
  [BizErrorCode.BIZ_DATA_CONFLICT]: '数据冲突',
  [BizErrorCode.BIZ_OPERATION_FORBIDDEN]: '当前业务状态禁止该操作',
  [BizErrorCode.BIZ_STATE_INVALID]: '业务状态非法',

  [BizErrorCode.BIZ_DELIVERY_OUT_OF_RANGE]: '超出配送范围',
  [BizErrorCode.BIZ_BELOW_MIN_ORDER_AMOUNT]: '订单未达起送价',

  [BizErrorCode.BIZ_STOCK_INSUFFICIENT]: '库存不足',
  [BizErrorCode.BIZ_PRODUCT_OFFLINE]: '商品已下架',
  [BizErrorCode.BIZ_SHOP_CLOSED]: '店铺已打烊',

  [BizErrorCode.BIZ_ORDER_NOT_FOUND]: '订单不存在',
  [BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED]: '当前订单状态不允许该操作',
  [BizErrorCode.BIZ_ORDER_NOT_OWNED]: '非本人订单',

  [BizErrorCode.BIZ_PAYMENT_FAILED]: '支付失败',
  [BizErrorCode.BIZ_PAYMENT_DUPLICATED]: '请勿重复支付',
  [BizErrorCode.BIZ_BALANCE_INSUFFICIENT]: '账户余额不足',

  [BizErrorCode.BIZ_REFUND_FAILED]: '退款失败',
  [BizErrorCode.BIZ_REFUND_OVER_LIMIT]: '退款金额超出可退余额',

  [BizErrorCode.BIZ_NO_AVAILABLE_RIDER]: '附近暂无可派骑手',
  [BizErrorCode.BIZ_DISPATCH_TIMEOUT]: '派单超时',

  [BizErrorCode.BIZ_COUPON_NOT_APPLICABLE]: '优惠券不适用',
  [BizErrorCode.BIZ_COUPON_USED]: '优惠券已使用',
  [BizErrorCode.BIZ_COUPON_EXPIRED]: '优惠券已过期',

  [BizErrorCode.BIZ_REVIEW_OUT_OF_PERIOD]: '评价不在有效期内',

  [BizErrorCode.AUTH_TOKEN_MISSING]: '未登录或缺少令牌',
  [BizErrorCode.AUTH_TOKEN_INVALID]: '令牌无效',
  [BizErrorCode.AUTH_PERMISSION_DENIED]: '权限不足',
  [BizErrorCode.AUTH_USER_TYPE_MISMATCH]: '用户身份类型不匹配',
  [BizErrorCode.AUTH_TOKEN_EXPIRED]: '令牌已过期',
  [BizErrorCode.AUTH_REFRESH_TOKEN_INVALID]: '刷新令牌无效或已过期',
  [BizErrorCode.AUTH_LOGIN_FAILED]: '登录失败',
  [BizErrorCode.AUTH_LOGIN_LOCKED]: '账户已锁定，请 30 分钟后再试',
  [BizErrorCode.AUTH_USER_NOT_FOUND]: '用户不存在',
  [BizErrorCode.AUTH_PASSWORD_INCORRECT]: '账号或密码错误',
  [BizErrorCode.AUTH_SMS_CODE_INVALID]: '验证码错误',
  [BizErrorCode.AUTH_SMS_CODE_EXPIRED]: '验证码不存在或已过期',
  [BizErrorCode.AUTH_ACCOUNT_DISABLED]: '账户已被禁用',
  [BizErrorCode.AUTH_ACCOUNT_BLACKLISTED]: '账户在黑名单中',
  [BizErrorCode.AUTH_SIGN_INVALID]: '签名校验失败',
  [BizErrorCode.AUTH_NONCE_REPLAY]: '请求重放，nonce 已使用',
  [BizErrorCode.AUTH_TIMESTAMP_EXPIRED]: '请求时间戳过期',

  [BizErrorCode.RATE_LIMIT_EXCEEDED]: '请求过于频繁，请稍后再试',
  [BizErrorCode.SMS_SEND_TOO_FREQUENT]: '验证码发送过于频繁，请 60 秒后再试',
  [BizErrorCode.IDEMPOTENT_DUPLICATE]: '请勿重复提交',

  [BizErrorCode.WX_API_ERROR]: '微信接口异常',
  [BizErrorCode.SMS_PROVIDER_ERROR]: '短信服务异常',
  [BizErrorCode.PUSH_PROVIDER_ERROR]: '推送服务异常',
  [BizErrorCode.MAP_PROVIDER_ERROR]: '地图服务异常',
  [BizErrorCode.STORAGE_PROVIDER_ERROR]: '存储服务异常',
  [BizErrorCode.PAYMENT_PROVIDER_ERROR]: '支付服务异常',

  [BizErrorCode.SYSTEM_INTERNAL_ERROR]: '服务器内部错误',
  [BizErrorCode.SYSTEM_TIMEOUT]: '请求超时',
  [BizErrorCode.SYSTEM_DB_ERROR]: '数据库异常',
  [BizErrorCode.SYSTEM_REDIS_ERROR]: '缓存服务异常',
  [BizErrorCode.SYSTEM_MQ_ERROR]: '消息队列异常',
  [BizErrorCode.SYSTEM_CONFIG_MISSING]: '系统配置缺失'
}

/**
 * 根据错误码取默认中文消息（未配置时返回 '未知错误'）
 * 参数：code 业务错误码
 * 返回值：中文消息字符串
 * 用途：HttpExceptionFilter / BusinessException 默认 message 取值
 */
export function getBizErrorMessage(code: number): string {
  return BizErrorMessage[code] ?? '未知错误'
}
