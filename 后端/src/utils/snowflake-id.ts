/**
 * @file snowflake-id.ts
 * @stage P3/T3.2
 * @desc 雪花 ID 生成器（64 位：1 sign + 41 timestamp + 10 worker + 12 sequence）
 * @author 员工 A
 *
 * 输出：BigInt → string（避免 JS Number 53 位精度丢失，与 BIGINT UNSIGNED 列对齐）
 *
 * workerId 取值优先级：
 *   1) 构造时传入（推荐：Redis 抢占 sys:snowflake:worker:{hostname} 后注入）
 *   2) ENV SNOWFLAKE_WORKER_ID（0~1023）
 *   3) hash(hostname) % 1024（兜底，单实例足够，多实例需手工避免冲突）
 *
 * Epoch：2026-01-01 00:00:00 UTC（项目启动近期，41 bit 时间戳可用 ~69 年）
 */

import { hostname } from 'os'

/** 自定义起始时间戳：2026-01-01 00:00:00 UTC = 1767225600000 */
const EPOCH = 1767225600000n
/** 时间戳左移位数（worker 10 + sequence 12） */
const TIMESTAMP_SHIFT = 22n
/** workerId 左移位数（sequence 12） */
const WORKER_SHIFT = 12n
/** workerId 最大值（10 bit） */
const MAX_WORKER_ID = 1023
/** 序列号最大值（12 bit） */
const MAX_SEQUENCE = 0xfffn

/**
 * 雪花 ID 生成器
 * 用途：业务 service 通过 `SnowflakeId.default().nextId()` 取 string ID 写入主键
 */
export class SnowflakeId {
  private static instance: SnowflakeId | null = null

  private readonly workerId: bigint
  private sequence = 0n
  private lastTimestamp = -1n

  /**
   * 构造函数
   * 参数：workerId 0~1023；超出时抛 RangeError
   */
  constructor(workerId: number) {
    if (!Number.isInteger(workerId) || workerId < 0 || workerId > MAX_WORKER_ID) {
      throw new RangeError(`[SnowflakeId] workerId 必须 0~${MAX_WORKER_ID}，当前 ${workerId}`)
    }
    this.workerId = BigInt(workerId)
  }

  /**
   * 进程级单例（默认 workerId 取自 ENV / hostname hash）
   * 参数：无
   * 返回值：SnowflakeId 单例
   * 用途：`SnowflakeId.default().nextId()`
   */
  static default(): SnowflakeId {
    if (!this.instance) {
      this.instance = new SnowflakeId(this.resolveWorkerId())
    }
    return this.instance
  }

  /**
   * 用户自定义 workerId 重置单例（启动时 Redis 抢占后调用）
   * 参数：workerId 0~1023
   * 返回值：SnowflakeId 实例
   */
  static configure(workerId: number): SnowflakeId {
    this.instance = new SnowflakeId(workerId)
    return this.instance
  }

  /**
   * 快捷方法：等价于 `SnowflakeId.default().nextId()`
   * 参数：无
   * 返回值：string 雪花 ID
   * 用途：业务 service 一行代码取主键 → `id: SnowflakeId.next()`
   */
  static next(): string {
    return this.default().nextId()
  }

  /**
   * 快捷方法：等价于 `SnowflakeId.default().nextIdBig()`
   * 参数：无
   * 返回值：BigInt 雪花 ID
   */
  static nextBig(): bigint {
    return this.default().nextIdBig()
  }

  /**
   * 解析 workerId（按优先级回退）
   * 返回值：[0, 1023] 内的整数
   */
  private static resolveWorkerId(): number {
    const envVal = parseInt(process.env.SNOWFLAKE_WORKER_ID ?? '', 10)
    if (Number.isInteger(envVal) && envVal >= 0 && envVal <= MAX_WORKER_ID) {
      return envVal
    }
    /* hostname → 31 bit djb2 hash → mod 1024（开发兜底，多实例可能撞号，需手工配） */
    const h = hostname()
    let hash = 5381
    for (let i = 0; i < h.length; i++) {
      hash = (hash * 33 + h.charCodeAt(i)) & 0x7fffffff
    }
    return hash % (MAX_WORKER_ID + 1)
  }

  /**
   * 生成下一个 ID
   * 参数：无
   * 返回值：BigInt
   * 错误：检测到时钟回拨 → 抛 Error（容忍 ≤ 5ms 内的回拨：等待补齐）
   */
  nextIdBig(): bigint {
    let now = BigInt(Date.now())

    if (now < this.lastTimestamp) {
      const drift = this.lastTimestamp - now
      if (drift > 5n) {
        throw new Error(`[SnowflakeId] 时钟回拨过大 ${drift}ms，拒绝生成`)
      }
      /* 小幅回拨：自旋等待补齐 */
      while (now < this.lastTimestamp) {
        now = BigInt(Date.now())
      }
    }

    if (now === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE
      if (this.sequence === 0n) {
        /* 当前 ms 序列号耗尽，自旋至下一毫秒 */
        while (now <= this.lastTimestamp) {
          now = BigInt(Date.now())
        }
      }
    } else {
      this.sequence = 0n
    }

    this.lastTimestamp = now

    return ((now - EPOCH) << TIMESTAMP_SHIFT) | (this.workerId << WORKER_SHIFT) | this.sequence
  }

  /**
   * 生成下一个 ID（字符串形式）
   * 参数：无
   * 返回值：BigInt 转字符串（与数据库 BIGINT UNSIGNED 列对齐）
   * 用途：实体主键、订单/支付/物流 流水号前置 ID
   */
  nextId(): string {
    return this.nextIdBig().toString()
  }

  /**
   * 解码：从 ID 还原时间戳/workerId/序列号（仅供运维/调试）
   * 参数：id 字符串或 BigInt
   * 返回值：{ timestamp, workerId, sequence }
   */
  static decode(id: string | bigint): { timestamp: number; workerId: number; sequence: number } {
    const big = typeof id === 'bigint' ? id : BigInt(id)
    const sequence = Number(big & MAX_SEQUENCE)
    const workerId = Number((big >> WORKER_SHIFT) & BigInt(MAX_WORKER_ID))
    const timestamp = Number((big >> TIMESTAMP_SHIFT) + EPOCH)
    return { timestamp, workerId, sequence }
  }
}
