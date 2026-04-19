/**
 * @file dashboard.service.ts
 * @stage P4/T4.43（Sprint 6）
 * @desc 运力看板：在线骑手数 / 待派 / 抢单池 / 配送中 / 接单耗时 / 接单率
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 数据源：
 *   - Redis ZCARD rider:online:{cityCode}                  在线骑手数
 *   - Redis SCARD dispatch:grabpool:{cityCode}             抢单池
 *   - MySQL dispatch_record (status=0)                     待派
 *   - MySQL dispatch_record (status=1, accepted_at IS NULL OR accepted_at>=...) 配送中
 *   - MySQL dispatch_record (status IN [1,2,3], created_at>=now-1h) 接单率 / 平均耗时
 *
 * 城市维度：
 *   - 入参 cityCode：单城市；不传 → 'all' 全平台聚合
 *   - 全平台聚合在线骑手数：扫描已知城市集合 sys:dispatch:cities Set（DispatchService
 *     在派单成功时 SADD；本期新建 service 时若无该 Set，则在线骑手数返回 0）
 *
 * 统计窗口：
 *   - 平均接单耗时 / 接单率：近 1 小时
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { DataSource } from 'typeorm'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { type DashboardVo } from '../dto/dashboard.dto'
import { DispatchStatusEnum } from '../types/dispatch.types'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 已知城市集合 Key（DispatchService 在抢单池写入时 SADD） */
const KNOWN_CITIES_KEY = 'sys:dispatch:cities'

/** 统计窗口：近 1 小时（毫秒） */
const STATS_WINDOW_MS = 60 * 60 * 1000

/** 抢单池 Key */
const GRAB_POOL_KEY = (cityCode: string): string => `dispatch:grabpool:${cityCode}`

/** 在线骑手 GEO Key */
const RIDER_ONLINE_KEY = (cityCode: string): string => `rider:online:${cityCode}`

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  /* ============================================================================
   * 主入口
   * ============================================================================ */

  /**
   * 计算运力看板
   * 参数：cityCode（不传 → 全平台聚合）
   * 返回值：DashboardVo
   */
  async getDashboard(cityCode?: string): Promise<DashboardVo> {
    const targetCity = cityCode ?? 'all'
    const onlineRiderCount = await this.computeOnlineCount(cityCode)
    const grabPoolCount = await this.computeGrabPoolCount(cityCode)
    const pendingDispatchCount = await this.computePendingDispatchCount()
    const activeOrderCount = await this.computeActiveOrderCount()
    const { avgAcceptDurationS, acceptRate } = await this.computeAcceptStats()

    return {
      cityCode: targetCity,
      onlineRiderCount,
      grabPoolCount,
      pendingDispatchCount,
      activeOrderCount,
      avgAcceptDurationS,
      acceptRate,
      snapshotAt: new Date()
    }
  }

  /* ============================================================================
   * Redis 维度
   * ============================================================================ */

  /**
   * 在线骑手数：单城市直接 ZCARD；全平台从 KNOWN_CITIES_KEY 集合累加
   */
  private async computeOnlineCount(cityCode?: string): Promise<number> {
    if (cityCode) {
      try {
        return await this.redis.zcard(RIDER_ONLINE_KEY(cityCode))
      } catch (err) {
        this.logger.warn(
          `computeOnlineCount 失败 city=${cityCode}：${err instanceof Error ? err.message : String(err)}`
        )
        return 0
      }
    }
    /* 全平台：从已知城市集合累加 */
    let cities: string[] = []
    try {
      cities = await this.redis.smembers(KNOWN_CITIES_KEY)
    } catch (err) {
      this.logger.warn(
        `computeOnlineCount 全平台 SMEMBERS 失败：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
    let total = 0
    for (const city of cities) {
      try {
        total += await this.redis.zcard(RIDER_ONLINE_KEY(city))
      } catch (err) {
        this.logger.warn(
          `computeOnlineCount city=${city} 失败：${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    return total
  }

  /**
   * 抢单池订单数
   */
  private async computeGrabPoolCount(cityCode?: string): Promise<number> {
    if (cityCode) {
      try {
        return await this.redis.scard(GRAB_POOL_KEY(cityCode))
      } catch (err) {
        this.logger.warn(
          `computeGrabPoolCount 失败 city=${cityCode}：${err instanceof Error ? err.message : String(err)}`
        )
        return 0
      }
    }
    let cities: string[] = []
    try {
      cities = await this.redis.smembers(KNOWN_CITIES_KEY)
    } catch (err) {
      this.logger.warn(
        `computeGrabPoolCount 全平台 SMEMBERS 失败：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
    let total = 0
    for (const city of cities) {
      try {
        total += await this.redis.scard(GRAB_POOL_KEY(city))
      } catch (err) {
        this.logger.warn(
          `computeGrabPoolCount city=${city} 失败：${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    return total
  }

  /* ============================================================================
   * MySQL 维度
   * ============================================================================ */

  /**
   * 待派订单数：dispatch_record status=0
   */
  private async computePendingDispatchCount(): Promise<number> {
    try {
      const rows = await this.dataSource.query<Array<{ cnt: string | number }>>(
        `SELECT COUNT(*) AS cnt FROM dispatch_record WHERE status = ? AND is_deleted = 0`,
        [DispatchStatusEnum.PENDING]
      )
      return rows[0]?.cnt != null ? Number(rows[0].cnt) : 0
    } catch (err) {
      this.logger.warn(
        `computePendingDispatchCount 失败：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
  }

  /**
   * 配送中订单数：dispatch_record status=1（已接受，且未送达）
   *   简化：以 dispatch_record(status=1) 计数。订单送达时由编排层置 status=4 或独立标记，
   *   本期 dispatch_record 不会因订单送达而自动更新；故仅用 created_at >= now - 24h 限制范围
   */
  private async computeActiveOrderCount(): Promise<number> {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const rows = await this.dataSource.query<Array<{ cnt: string | number }>>(
        `SELECT COUNT(DISTINCT order_no) AS cnt
           FROM dispatch_record
          WHERE status = ? AND created_at >= ? AND is_deleted = 0`,
        [DispatchStatusEnum.ACCEPTED, since]
      )
      return rows[0]?.cnt != null ? Number(rows[0].cnt) : 0
    } catch (err) {
      this.logger.warn(
        `computeActiveOrderCount 失败：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
  }

  /**
   * 平均接单耗时（秒，近 1h）+ 接单率
   *   - avgAcceptDurationS = AVG(accepted_at - created_at)，仅 status=1
   *   - acceptRate         = count(status=1) / count(status IN [1,2,3])
   */
  private async computeAcceptStats(): Promise<{
    avgAcceptDurationS: number
    acceptRate: number
  }> {
    try {
      const since = new Date(Date.now() - STATS_WINDOW_MS)
      const rows = await this.dataSource.query<
        Array<{
          accepted_count: string | number | null
          all_count: string | number | null
          avg_secs: string | number | null
        }>
      >(
        `SELECT
           SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS accepted_count,
           SUM(CASE WHEN status IN (?, ?, ?) THEN 1 ELSE 0 END) AS all_count,
           AVG(CASE WHEN status = ? AND accepted_at IS NOT NULL
                    THEN TIMESTAMPDIFF(SECOND, created_at, accepted_at)
                    ELSE NULL END) AS avg_secs
           FROM dispatch_record
          WHERE created_at >= ? AND is_deleted = 0`,
        [
          DispatchStatusEnum.ACCEPTED,
          DispatchStatusEnum.ACCEPTED,
          DispatchStatusEnum.REJECTED,
          DispatchStatusEnum.TIMEOUT,
          DispatchStatusEnum.ACCEPTED,
          since
        ]
      )
      const first = rows[0]
      const acceptedCount = first?.accepted_count != null ? Number(first.accepted_count) : 0
      const allCount = first?.all_count != null ? Number(first.all_count) : 0
      const avgSecs = first?.avg_secs != null ? Number(first.avg_secs) : 0
      return {
        avgAcceptDurationS: Math.round(avgSecs * 10) / 10,
        acceptRate: allCount > 0 ? Math.round((acceptedCount / allCount) * 1000) / 1000 : 0
      }
    } catch (err) {
      this.logger.warn(
        `computeAcceptStats 失败：${err instanceof Error ? err.message : String(err)}`
      )
      return { avgAcceptDurationS: 0, acceptRate: 0 }
    }
  }

  /* ============================================================================
   * 维护：注册城市 Key（DispatchService 在 markGrabPool / 系统派单时调用）
   * ============================================================================ */

  /**
   * 把城市注册到 sys:dispatch:cities 集合，便于全平台聚合
   * 参数：cityCode
   * 返回值：void
   */
  async registerCity(cityCode: string): Promise<void> {
    if (!cityCode) return
    try {
      await this.redis.sadd(KNOWN_CITIES_KEY, cityCode)
    } catch (err) {
      this.logger.warn(
        `registerCity 失败 city=${cityCode}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}
