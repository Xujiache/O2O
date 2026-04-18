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
