/**
 * @file order-shard-job.ts
 * @stage P2/T2.16 → R1 实现
 * @desc 月分表自动维护 Job：分布式锁 + 失败告警
 * @design 详见 ./monthly-table-job.md
 * @author 员工 A；R1 补齐分布式锁 + 告警
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import Redis from 'ioredis'
import type { DataSource } from 'typeorm'
import { REDIS_CLIENT } from '../../health/redis.provider'

const LOCK_KEY_PREFIX = 'lock:job:monthly-table:'
const LOCK_TTL_MS = 300_000

/**
 * OrderShardJob —— 订单按月分表自动预创建调度任务
 *
 * 功能：每月 1 日 02:00 调用 sp_create_order_monthly_tables 存储过程
 * 安全：Redis SET NX PX 分布式锁，保证多实例幂等
 * 告警：失败时 logger.error + 可选钉钉 webhook 推送
 *
 * 已注册到 DatabaseModule providers（R1 补齐）
 */
@Injectable()
export class OrderShardJob {
  private readonly logger = new Logger(OrderShardJob.name)

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService
  ) {}

  /**
   * Cron 触发入口：每月 1 日 02:00（Asia/Shanghai）创建下月分表
   */
  @Cron('0 0 2 1 * *', {
    name: 'order-shard-job',
    timeZone: 'Asia/Shanghai'
  })
  async handleMonthly(): Promise<void> {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextYyyymm = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}`
    await this.createForMonth(nextYyyymm)
  }

  /**
   * 手动/Cron 共用执行入口（幂等，分布式锁保护）
   * @param yyyymm 6 位年月字符串（例 '202608'）
   */
  async createForMonth(yyyymm: string): Promise<void> {
    const lockKey = LOCK_KEY_PREFIX + yyyymm
    const lockValue = `${process.pid}-${Date.now()}`

    const acquired = await this.redis.set(lockKey, lockValue, 'PX', LOCK_TTL_MS, 'NX')
    if (!acquired) {
      this.logger.log(`分布式锁已被占用，跳过 ${yyyymm}`)
      return
    }

    this.logger.log(`Creating monthly tables for ${yyyymm}`)
    try {
      await this.ds.query('CALL sp_create_order_monthly_tables(?)', [yyyymm])
      this.logger.log(`OK: monthly tables for ${yyyymm}`)
    } catch (err) {
      this.logger.error(`FAILED: monthly tables for ${yyyymm}`, err as Error)
      await this.alertFailure(yyyymm, (err as Error).message)
      throw err
    } finally {
      const current = await this.redis.get(lockKey)
      if (current === lockValue) {
        await this.redis.del(lockKey)
      }
    }
  }

  /**
   * 失败告警：钉钉 webhook（配置了才推送，否则仅 log）
   */
  private async alertFailure(yyyymm: string, errMsg: string): Promise<void> {
    const webhook = this.configService.get<string>('DINGTALK_WEBHOOK', '')
    if (!webhook) return
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content: `[OrderShardJob] ${yyyymm} 分表创建失败: ${errMsg}` }
        })
      })
    } catch {
      this.logger.warn('钉钉告警推送失败')
    }
  }
}
