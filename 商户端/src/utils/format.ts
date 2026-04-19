/**
 * @file format.ts
 * @stage P6/T6.2 (Sprint 1)
 * @desc 通用格式化工具：金额（currency.js）、时间（dayjs）、距离、敏感信息脱敏
 *
 * P5 经验教训：金额禁止 `Number()` 直接比较 / 加减
 *   - I-03 修复：shop-detail / checkout / coupons-select 全部改用 currency.js + compareAmount
 *   - 商户端结算 / 提现 / 账单 100% 必须用 addAmount / subAmount / mulAmount / compareAmount
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import currency from 'currency.js'
import dayjs from 'dayjs'

/**
 * 金额格式化
 * @param value string 后端返回的金额字符串（如 "50.00"）
 * @param prefix 前缀（如 '¥'）
 * @returns string 格式化后金额（如 '¥50.00'）
 * @description 严禁直接 number 加减；使用 currency.js 大数库
 */
export function formatAmount(value: string | number | undefined | null, prefix = '¥'): string {
  if (value === null || value === undefined || value === '') return `${prefix}0.00`
  const c = currency(value, { symbol: prefix, precision: 2 })
  return c.format()
}

/**
 * 金额加法（基于 currency.js）
 * @param a 加数 1
 * @param b 加数 2
 * @returns string 结果（保留 2 位小数字符串）
 */
export function addAmount(a: string | number, b: string | number): string {
  return currency(a).add(b).toString()
}

/** 金额减法 */
export function subAmount(a: string | number, b: string | number): string {
  return currency(a).subtract(b).toString()
}

/** 金额乘法 */
export function mulAmount(a: string | number, b: number): string {
  return currency(a).multiply(b).toString()
}

/** 金额除法（结果保留 2 位小数；除以 0 返回 '0'） */
export function divAmount(a: string | number, b: number): string {
  if (b === 0) return '0'
  return currency(a).divide(b).toString()
}

/**
 * 比较两个金额（基于 currency.js 大数库，避免 number 浮点精度问题）
 * @param a 金额 1（string 或 number）
 * @param b 金额 2（string 或 number）
 * @returns -1 (a<b) / 0 (a=b) / 1 (a>b)
 * @description 用于结算 / 提现金额上限 / 余额校验等场景
 *   严禁直接用 `Number(a) >= Number(b)` 比较金额（会触发 0.1+0.2 精度问题）
 */
export function compareAmount(a: string | number, b: string | number): -1 | 0 | 1 {
  const av = currency(a).value
  const bv = currency(b).value
  if (av < bv) return -1
  if (av > bv) return 1
  return 0
}

/** 求和数组（金额数组求和） */
export function sumAmount(arr: (string | number)[]): string {
  let total = '0'
  for (const v of arr) total = addAmount(total, v)
  return total
}

/**
 * 时间格式化（输入 ISO 8601 / number / Date）
 * @param value ISO 字符串、毫秒数、Date
 * @param fmt dayjs 格式字符串，默认 'YYYY-MM-DD HH:mm'
 * @returns string 本地时区格式化字符串
 */
export function formatTime(
  value: string | number | Date | undefined | null,
  fmt = 'YYYY-MM-DD HH:mm'
): string {
  if (!value) return ''
  return dayjs(value).format(fmt)
}

/** 仅日期 */
export function formatDate(value: string | number | Date | undefined | null): string {
  return formatTime(value, 'YYYY-MM-DD')
}

/** 仅时间 */
export function formatHm(value: string | number | Date | undefined | null): string {
  return formatTime(value, 'HH:mm')
}

/** 相对时间（如 "5 分钟前"） */
export function fromNow(value: string | number | Date | undefined | null): string {
  if (!value) return ''
  const diffMin = dayjs().diff(dayjs(value), 'minute')
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return formatTime(value, 'YYYY-MM-DD')
}

/**
 * 距离格式化（米）
 * @param meters 距离（米）
 * @returns 1km 以内显示米；≥ 1km 显示 km（保留 1 位）
 */
export function formatDistance(meters: number | string | undefined | null): string {
  if (meters === null || meters === undefined || meters === '') return '-'
  const m = Number(meters)
  if (Number.isNaN(m) || m < 0) return '-'
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(1)}km`
}

/** 手机号脱敏（默认 _tail4 显示） */
export function maskMobile(mobile: string | undefined | null): string {
  if (!mobile || mobile.length < 7) return mobile ?? ''
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`
}

/** 身份证脱敏 */
export function maskIdCard(idCard: string | undefined | null): string {
  if (!idCard || idCard.length < 8) return idCard ?? ''
  return `${idCard.slice(0, 3)}${'*'.repeat(idCard.length - 7)}${idCard.slice(-4)}`
}

/** 通用末 4 位脱敏（银行卡号等） */
export function tail4(value: string | undefined | null): string {
  if (!value || value.length < 4) return value ?? ''
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`
}

/** 数字千分位（如 "12,345"） */
export function formatNumber(n: number | string | undefined | null): string {
  if (n === null || n === undefined || n === '') return '0'
  const num = Number(n)
  if (Number.isNaN(num)) return '0'
  return num.toLocaleString('zh-CN')
}

/**
 * 时长格式化（秒 -> "5分30秒"）
 * 用于配送预计时长 / 出餐时长 / 提现到账时长等
 */
export function formatDuration(seconds: number | undefined | null): string {
  if (!seconds || seconds < 0) return '-'
  if (seconds < 60) return `${seconds}秒`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (min < 60) return sec > 0 ? `${min}分${sec}秒` : `${min}分`
  const hour = Math.floor(min / 60)
  const mm = min % 60
  return mm > 0 ? `${hour}小时${mm}分` : `${hour}小时`
}
