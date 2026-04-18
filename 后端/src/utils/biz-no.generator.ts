/**
 * @file biz-no.generator.ts
 * @stage P3/T3.2（增量）
 * @desc 业务编号生成器：商户号 / 骑手号等"前缀+日期+序号"短编号
 *       格式 [前缀1][yyyyMMdd 8][seq 6] = 共 15 位
 *         - merchant.merchant_no  M+yyyyMMdd+6 位序列（M+8+6=15）
 *         - rider.rider_no        R+yyyyMMdd+6 位序列
 * @author 员工 A
 *
 * 与 OrderNoGenerator 区分：
 *   - OrderNoGenerator → 18 位含 Luhn 校验（用于交易订单号）
 *   - generateBizNo    → 15 位无校验（用于内部业务编号；展示友好）
 *
 * 当前实现：内存计数器 + 日切归零（单实例足矣）；
 *           多实例并发应改 Redis INCR `seq:bizno:{prefix}:{yyyymmdd}`（P9 改造）
 */

import { BusinessException } from '../common/exceptions/business.exception'
import { BizErrorCode } from '../common/error-codes'

/** 内存计数器 Map<prefix:yyyymmdd, seq> */
const bizSeqCounter = new Map<string, number>()

/**
 * 生成业务编号
 * 参数：
 *   prefix 单字母前缀（M=商户/R=骑手 等；建议大写英文字母）
 *   date   日期（默认当前北京时区）
 * 返回值：15 位字符串（前缀1 + yyyyMMdd 8 + seq 6）
 * 错误：日内序列耗尽（>999999） → BusinessException
 */
export function generateBizNo(prefix: string, date: Date = new Date()): string {
  if (!prefix || prefix.length !== 1) {
    throw new BusinessException(BizErrorCode.PARAM_INVALID, 'generateBizNo: prefix 必须 1 字符')
  }
  const beijing = new Date(date.getTime() + 8 * 3600 * 1000)
  const y = beijing.getUTCFullYear()
  const m = (beijing.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = beijing.getUTCDate().toString().padStart(2, '0')
  const yyyymmdd = `${y}${m}${d}`

  const counterKey = `${prefix}:${yyyymmdd}`
  const seq = (bizSeqCounter.get(counterKey) ?? 0) + 1
  if (seq > 999_999) {
    throw new BusinessException(
      BizErrorCode.SYSTEM_INTERNAL_ERROR,
      `generateBizNo: ${counterKey} 日内序列耗尽（>999999）`
    )
  }
  bizSeqCounter.set(counterKey, seq)
  return `${prefix}${yyyymmdd}${seq.toString().padStart(6, '0')}`
}

/**
 * 测试钩子：清空计数器
 */
export function __resetBizNo(): void {
  bizSeqCounter.clear()
}
