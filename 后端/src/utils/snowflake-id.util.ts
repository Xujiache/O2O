/**
 * @file snowflake-id.util.ts
 * @stage P3/T3.2（员工 C 临时占位 → 集成时由组长 A 统一接管）
 * @desc 雪花 ID 生成器（Twitter Snowflake 64bit 改良版）
 *
 * 位段（共 63 位有效，第 64 位符号位 0）：
 *   - 41 位 时间戳差（毫秒，自 EPOCH 起算，可用 ~69 年）
 *   - 10 位 workerId（机器标识，0~1023；DESIGN §7.4 "启动时抢占 Redis sys:snowflake:worker:{hostname}"）
 *   - 12 位 序列号（同毫秒内自增，0~4095）
 *
 * 设计：
 *  - 输出 BigInt → string，避免 53 位 Number 安全整数上限溢出
 *  - 单实例并发安全（同一进程内通过 lastTimestamp + sequence 锁）
 *  - workerId 在 P3 完整上线时由 A 通过 Redis 分布式锁抢占；本占位实现支持
 *    `process.env.SNOWFLAKE_WORKER_ID` 注入，未配置时按 hostname hash 派生
 *
 * 用途：file_meta.id / file_no / future order_no / future user_id 全平台主键
 */

import { hostname } from 'os'

/** 项目纪元（2026-01-01 00:00:00 +0800 → UTC 1735660800000）—— 与 PRD V1.0 发布对齐 */
const EPOCH = 1735660800000n
const WORKER_BITS = 10n
const SEQUENCE_BITS = 12n
const MAX_WORKER_ID = (1n << WORKER_BITS) - 1n
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n
const TIMESTAMP_LEFT_SHIFT = WORKER_BITS + SEQUENCE_BITS
const WORKER_LEFT_SHIFT = SEQUENCE_BITS

/**
 * 派生 workerId
 * - 优先 process.env.SNOWFLAKE_WORKER_ID（数字字符串）
 * - 兜底 hostname 字符串求和取模 1024
 * 用途：内部，懒初始化时调用一次
 */
function deriveWorkerId(): bigint {
  const raw = process.env.SNOWFLAKE_WORKER_ID
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0 && n <= Number(MAX_WORKER_ID)) {
      return BigInt(n)
    }
  }
  let acc = 0
  const host = hostname()
  for (let i = 0; i < host.length; i++) {
    acc = (acc * 131 + host.charCodeAt(i)) % 1024
  }
  return BigInt(acc)
}

/**
 * Snowflake 64 位主键生成器
 *
 * 用途：业务模块通过 `SnowflakeId.next()` / `SnowflakeId.nextString()` 取主键
 *      （字符串形态，与 BIGINT UNSIGNED 主键的 TypeORM 映射对齐）
 */
export class SnowflakeId {
  private static workerId: bigint = deriveWorkerId()
  private static sequence: bigint = 0n
  private static lastTimestamp: bigint = -1n

  /**
   * 生成 64 位 BigInt 主键
   * 参数：无
   * 返回值：bigint
   * 错误：时钟回拨且超过 5ms 容忍度时抛 Error
   */
  static next(): bigint {
    let now = BigInt(Date.now())
    if (now < this.lastTimestamp) {
      const offset = this.lastTimestamp - now
      if (offset <= 5n) {
        // 小幅回拨：等待至 lastTimestamp
        const delayMs = Number(offset) + 1
        const target = Date.now() + delayMs
        while (Date.now() < target) {
          /* spin（≤ 5ms） */
        }
        now = BigInt(Date.now())
      } else {
        throw new Error(`[SnowflakeId] 时钟回拨 ${offset}ms 超过容忍 5ms`)
      }
    }
    if (now === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE
      if (this.sequence === 0n) {
        // 同毫秒内序列耗尽，自旋等到下一毫秒
        while (BigInt(Date.now()) <= this.lastTimestamp) {
          /* spin */
        }
        now = BigInt(Date.now())
      }
    } else {
      this.sequence = 0n
    }
    this.lastTimestamp = now
    return (
      ((now - EPOCH) << TIMESTAMP_LEFT_SHIFT) | (this.workerId << WORKER_LEFT_SHIFT) | this.sequence
    )
  }

  /**
   * 生成字符串形式主键（与 TypeORM bigint 列映射对齐）
   * 参数：无
   * 返回值：string
   */
  static nextString(): string {
    return this.next().toString()
  }

  /**
   * 生成业务文件号（前缀 F + 14 位时间戳 + 8 位随机）
   * 参数：无
   * 返回值：string，长度 23
   * 用途：File Module 写入 file_meta.file_no
   */
  static nextFileNo(): string {
    const ts = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14)
    const rand = Math.floor(Math.random() * 1e8)
      .toString(36)
      .padStart(8, '0')
      .slice(-8)
    return `F${ts}${rand}`
  }

  /**
   * 测试钩子：重置内部状态（仅 spec 用，业务请勿调用）
   * 参数：workerId 可选自定义 worker（默认重新派生）
   * 返回值：无
   */
  static __reset(workerId?: number): void {
    this.lastTimestamp = -1n
    this.sequence = 0n
    if (typeof workerId === 'number') {
      this.workerId = BigInt(workerId)
    } else {
      this.workerId = deriveWorkerId()
    }
  }
}
