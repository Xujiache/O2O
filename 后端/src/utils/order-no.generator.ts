/**
 * @file order-no.generator.ts
 * @stage P3/T3.2
 * @desc 业务订单号生成器，对齐 P2 04_order.sql 中 order_no 列规范
 *       格式 18 位：[T|E][yyyyMMdd 8][shard 2][seq 6][checksum 1]
 *         - 前缀 T = 外卖 takeout / E = 跑腿 errand
 *         - yyyyMMdd  按下单日期（北京时间）
 *         - shard     2 位分片号 00~99，与 P2 订单物理分表 takeout_order_00~07 对齐（mod 8）
 *         - seq       6 位日内序列（左补 0），上限 999999；日切归零
 *         - checksum  Luhn 校验位（取数字部分计算后单数字附加）
 * @author 员工 A
 *
 * 序列号实现说明：
 *   - 内存 + Map<日期前缀, number> 维护，简单单实例足矣；
 *   - 多实例并发场景应改用 Redis INCR `order:seq:{shard}:{yyyyMMdd}`（P3.5 之后改造）；
 *   - 当前阶段仅供 service 层占位返回 18 位号段，不破坏 build 链。
 */

import { BusinessException } from '../common/exceptions/business.exception'
import { BizErrorCode } from '../common/error-codes'

/** 订单业务前缀 */
export type OrderType = 'T' | 'E'

/** 一段日期+分片对应的内存计数器 */
const seqCounter = new Map<string, number>()

/**
 * 业务订单号生成器
 * 用途：OrderService.create 时生成 order_no 写入主表
 */
export class OrderNoGenerator {
  /**
   * 生成 18 位 order_no
   * 参数：
   *   type  订单类型：'T' 外卖 / 'E' 跑腿
   *   shard 0~99 物理分片号（必传，由 OrderService 计算：userId BigInt % 8 → 00~07）
   *   date  下单日期（默认当前北京时区）
   * 返回值：18 位字符串（CHAR(18) 列直接落库）
   * 错误：shard 越界 / 日内序列耗尽（>999999） → BusinessException
   */
  static next(type: OrderType, shard: number, date: Date = new Date()): string {
    if (!Number.isInteger(shard) || shard < 0 || shard > 99) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'OrderNoGenerator: shard 必须 0~99')
    }

    const yyyymmdd = this.formatBeijingDate(date)
    const shardStr = shard.toString().padStart(2, '0')
    const counterKey = `${type}:${yyyymmdd}:${shardStr}`
    const seq = (seqCounter.get(counterKey) ?? 0) + 1
    if (seq > 999_999) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_INTERNAL_ERROR,
        `OrderNoGenerator: ${counterKey} 日内序列耗尽（>999999）`
      )
    }
    seqCounter.set(counterKey, seq)
    const seqStr = seq.toString().padStart(6, '0')

    /* 前 17 位（type + 日期 + 分片 + 序列）= 1 + 8 + 2 + 6 = 17 */
    const head = `${type}${yyyymmdd}${shardStr}${seqStr}`
    const checksum = this.luhn(head.replace(/\D/g, ''))
    return head + checksum.toString()
  }

  /**
   * 格式化北京时间日期 yyyyMMdd
   * 参数：date Date 实例
   * 返回值：8 字符字符串
   */
  private static formatBeijingDate(date: Date): string {
    /* 显式构造北京时间（UTC+8）；不依赖运行时 TZ */
    const beijing = new Date(date.getTime() + 8 * 3600 * 1000)
    const y = beijing.getUTCFullYear()
    const m = (beijing.getUTCMonth() + 1).toString().padStart(2, '0')
    const d = beijing.getUTCDate().toString().padStart(2, '0')
    return `${y}${m}${d}`
  }

  /**
   * Luhn 校验位计算（仅对数字字符部分）
   * 参数：digits 纯数字字符串
   * 返回值：0~9 单数字校验位
   */
  private static luhn(digits: string): number {
    let sum = 0
    let alt = true /* 从右起首位 alt=true（×2） */
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits.charCodeAt(i) - 48
      if (alt) {
        n *= 2
        if (n > 9) n -= 9
      }
      sum += n
      alt = !alt
    }
    return (10 - (sum % 10)) % 10
  }

  /**
   * 校验 order_no 的 18 位结构 + Luhn
   * 参数：no order_no 字符串
   * 返回值：boolean
   * 用途：业务侧防注入 / 接口入参校验
   */
  static verify(no: string): boolean {
    if (!no || no.length !== 18) return false
    if (!/^[TE][0-9]{17}$/.test(no)) return false
    const head = no.slice(0, 17).replace(/\D/g, '')
    const checksum = parseInt(no.slice(17), 10)
    return this.luhn(head) === checksum
  }

  /**
   * 测试钩子：清空内存计数器
   * 参数：无
   * 返回值：无
   */
  static __reset(): void {
    seqCounter.clear()
  }
}
