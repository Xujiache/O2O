/**
 * 业务格式化工具：金额、脱敏、日期范围
 *
 * 【P5/I-03 教训】所有金额必须用 currency.js，禁止 Number(amount) 直接相加 / 比较
 * 适用模块：财务 / 账单 / 分账 / 提现 / 对账 / 退款 / 发票
 *
 * @module utils/business/format
 */
import currency from 'currency.js'

/**
 * 业务金额标准化：fen → yuan，固定 2 位精度，全部经 currency.js
 * @param val number | string 金额
 * @param mode fen | yuan 输入单位（默认 yuan）
 */
export function toAmount(
  val: number | string | undefined | null,
  mode: 'fen' | 'yuan' = 'yuan'
): currency {
  if (val === undefined || val === null || val === '') return currency(0)
  if (mode === 'fen') {
    const n = typeof val === 'string' ? Number(val) : val
    return currency(n, { fromCents: true, precision: 2 })
  }
  return currency(val, { precision: 2 })
}

/**
 * 金额加法（n 项），返回 currency
 */
export function addAmount(
  ...items: Array<number | string | currency | undefined | null>
): currency {
  return items.reduce<currency>((acc, item) => {
    if (item === undefined || item === null || item === '') return acc
    return acc.add(item as number | string | currency)
  }, currency(0))
}

/**
 * 金额减法 a - b
 */
export function subAmount(a: number | string | currency, b: number | string | currency): currency {
  return currency(a).subtract(b)
}

/**
 * 金额比较 a vs b：负数表示 a < b，0 相等，正数 a > b
 */
export function compareAmount(
  a: number | string | currency,
  b: number | string | currency
): number {
  const av = currency(a).value
  const bv = currency(b).value
  if (av < bv) return -1
  if (av > bv) return 1
  return 0
}

/**
 * 业务展示金额：format ¥0.00
 * @param val
 * @param withSymbol 是否带 ¥ 符号
 */
export function formatAmount(
  val: number | string | currency | undefined | null,
  withSymbol = true
): string {
  const c = val === undefined || val === null || val === '' ? currency(0) : currency(val)
  return withSymbol
    ? `¥${c.format({ symbol: '', precision: 2 })}`
    : c.format({ symbol: '', precision: 2 })
}

/**
 * 手机号脱敏：13812345678 → 138****5678
 */
export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return '-'
  const s = String(mobile)
  if (s.length < 7) return s
  return s.replace(/^(\d{3})\d{4}(\d+)$/, '$1****$2')
}

/**
 * 身份证脱敏：110101199001011234 → 1101***********234
 */
export function maskIdCard(id: string | null | undefined): string {
  if (!id) return '-'
  const s = String(id)
  if (s.length < 8) return s
  return s.replace(/^(\d{4})\d+(\d{3})$/, '$1**********$2')
}

/**
 * 银行卡脱敏：6225881234567890 → 6225 **** **** 7890
 */
export function maskBankCard(card: string | null | undefined): string {
  if (!card) return '-'
  const s = String(card).replace(/\s/g, '')
  if (s.length < 8) return s
  return `${s.slice(0, 4)} **** **** ${s.slice(-4)}`
}

/**
 * 姓名脱敏：张三 → 张*；张三丰 → 张*丰
 */
export function maskName(name: string | null | undefined): string {
  if (!name) return '-'
  const s = String(name).trim()
  if (s.length <= 1) return s
  if (s.length === 2) return `${s.charAt(0)}*`
  return `${s.charAt(0)}${'*'.repeat(s.length - 2)}${s.charAt(s.length - 1)}`
}

/**
 * 邮箱脱敏：abc@xx.com → a**@xx.com
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '-'
  const s = String(email)
  const at = s.indexOf('@')
  if (at <= 1) return s
  return `${s.charAt(0)}${'*'.repeat(Math.max(at - 2, 1))}${s.charAt(at - 1)}${s.slice(at)}`
}

/**
 * 字节大小格式化：1024 → 1 KB
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}

/**
 * 日期范围快捷选项（业务统一）：今日 / 昨日 / 近 7 / 近 30 / 本月 / 上月
 */
export function getDateRangeShortcuts() {
  const now = new Date()
  const startOfDay = (d: Date) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }
  const endOfDay = (d: Date) => {
    const x = new Date(d)
    x.setHours(23, 59, 59, 999)
    return x
  }
  return [
    {
      text: '今日',
      value: () => [startOfDay(now), endOfDay(now)] as [Date, Date]
    },
    {
      text: '昨日',
      value: () => {
        const y = new Date(now)
        y.setDate(now.getDate() - 1)
        return [startOfDay(y), endOfDay(y)] as [Date, Date]
      }
    },
    {
      text: '近 7 天',
      value: () => {
        const s = new Date(now)
        s.setDate(now.getDate() - 6)
        return [startOfDay(s), endOfDay(now)] as [Date, Date]
      }
    },
    {
      text: '近 30 天',
      value: () => {
        const s = new Date(now)
        s.setDate(now.getDate() - 29)
        return [startOfDay(s), endOfDay(now)] as [Date, Date]
      }
    },
    {
      text: '本月',
      value: () => {
        const s = new Date(now.getFullYear(), now.getMonth(), 1)
        return [startOfDay(s), endOfDay(now)] as [Date, Date]
      }
    },
    {
      text: '上月',
      value: () => {
        const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const e = new Date(now.getFullYear(), now.getMonth(), 0)
        return [startOfDay(s), endOfDay(e)] as [Date, Date]
      }
    }
  ]
}

/**
 * Date 转 yyyy-MM-dd HH:mm:ss
 */
export function fmtDateTime(d: Date | string | number | undefined | null): string {
  if (!d) return '-'
  const x = new Date(d)
  if (isNaN(x.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`
}

/**
 * Date 转 yyyy-MM-dd
 */
export function fmtDate(d: Date | string | number | undefined | null): string {
  if (!d) return '-'
  const x = new Date(d)
  if (isNaN(x.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
