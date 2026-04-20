/**
 * @file sys-config.service.ts
 * @stage R1/T-R1-10
 * @desc sys_config 运行时配置服务（5min Redis 缓存 + DB 兜底）
 *
 * 提供：get<T>(key, fallback) / getMany(keys) / invalidate(key)
 * 首批接入点：user-coupon.service（新客礼券开关/券模板 ID）、invite-relation.service（积分奖励数）
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { DataSource } from 'typeorm'
import { REDIS_CLIENT } from '../../health/redis.provider'

const CACHE_PREFIX = 'sys_config:'
const CACHE_TTL = 300

@Injectable()
export class SysConfigService {
  private readonly logger = new Logger(SysConfigService.name)

  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /**
   * 获取单个配置值
   * @param key 配置键
   * @param fallback 缺省值
   * @returns 配置值或 fallback
   */
  async get<T = string>(key: string, fallback: T): Promise<T> {
    try {
      const cached = await this.redis.get(CACHE_PREFIX + key)
      if (cached != null) return JSON.parse(cached) as T
    } catch {
      this.logger.warn(`Redis get sys_config:${key} 失败，回退 DB`)
    }

    try {
      const rows = await this.dataSource.query<Array<{ config_value: string }>>(
        'SELECT config_value FROM sys_config WHERE config_key = ? AND is_deleted = 0 LIMIT 1',
        [key]
      )
      if (rows.length > 0) {
        const val = JSON.parse(rows[0].config_value) as T
        this.redis.set(CACHE_PREFIX + key, rows[0].config_value, 'EX', CACHE_TTL).catch(() => {})
        return val
      }
    } catch (err) {
      this.logger.error(`DB get sys_config key=${key} 失败：${(err as Error).message}`)
    }

    return fallback
  }

  /**
   * 批量获取多个配置值
   * @param keys 配置键数组
   * @returns key → value 映射
   */
  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {}
    for (const key of keys) {
      result[key] = await this.get(key, null)
    }
    return result
  }

  /**
   * 清除指定 key 的缓存（修改配置后手动调用）
   * @param key 配置键
   */
  async invalidate(key: string): Promise<void> {
    await this.redis.del(CACHE_PREFIX + key)
  }
}
