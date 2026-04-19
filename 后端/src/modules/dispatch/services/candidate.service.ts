/**
 * @file candidate.service.ts
 * @stage P4/T4.37（Sprint 6）
 * @desc 候选骑手筛选：GEORADIUS 3km + 偏好 + 运力 + 黑名单
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 数据来源：
 *   - Redis GEO         rider:online:{cityCode}（由 RiderLocationService 维护）
 *   - Redis Set         rider:active:{riderId} （活跃订单数；本服务负责 SADD/SREM）
 *   - MySQL rider       骑手评分 / 状态校验
 *   - MySQL rider_preference 接单偏好（接单模式 / 类型 / 半径 / 并发上限）
 *   - BlacklistService  全局黑名单（targetType=3 rider）
 *
 * 筛选规则（按用户任务书 §6.1）：
 *   1) GEO 半径检索（默认 3km，可按订单 cityCode 配置）
 *   2) 偏好兼容性：
 *      a) accept_mode 包含"系统派单"（=1 / =3）
 *      b) accept_takeout=1（外卖订单）
 *      c) accept_errand=1 且 errand_types 包含 serviceType（跑腿订单）
 *      d) accept_radius_m >= 距离（米）
 *   3) 运力上限：当前 active 订单数 < accept_max_concurrent
 *   4) 黑名单：BlacklistService.isBlacklisted(3, riderId) === false
 *   5) 在线状态：rider.status=1 / online_status=1（兜底校验，理论上 GEO 已过滤离线）
 *
 * 返回：RiderCandidate[]（已附 distanceM/distanceKm/riderScore/currentOrders/maxConcurrent）
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { In, Repository } from 'typeorm'
import { Rider, RiderPreference } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { RiderLocationService } from '@/modules/map/rider-location.service'
import { BlacklistService } from '@/modules/user/services/blacklist.service'
import {
  AcceptModeEnum,
  OrderTypeForDispatch,
  type DispatchOrderContext,
  type RiderCandidate
} from '../types/dispatch.types'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 候选 GEORADIUS 默认半径（公里），与 DESIGN_P4 §5.2 一致 */
const DEFAULT_SEARCH_RADIUS_KM = 3

/** GEORADIUS 最大返回候选数（CONSENSUS_P4 §四 风险：候选集 ≤ 100） */
const MAX_GEO_CANDIDATES = 50

/** 黑名单 targetType：rider */
const BLACKLIST_TARGET_RIDER = 3

/** 默认骑手并发上限（无偏好记录时兜底） */
const DEFAULT_MAX_CONCURRENT = 5

/** 默认接单半径（米；无偏好记录时兜底） */
const DEFAULT_ACCEPT_RADIUS_M = 3000

/** 活跃订单 Set Key 模板：用于派单决策时计算"当前并发数" */
const RIDER_ACTIVE_KEY = (riderId: string): string => `rider:active:${riderId}`

@Injectable()
export class CandidateService {
  private readonly logger = new Logger(CandidateService.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(Rider) private readonly riderRepo: Repository<Rider>,
    @InjectRepository(RiderPreference)
    private readonly preferenceRepo: Repository<RiderPreference>,
    private readonly riderLocService: RiderLocationService,
    private readonly blacklistService: BlacklistService
  ) {}

  /* ============================================================================
   * 主入口：findCandidates
   * ============================================================================ */

  /**
   * 检索可派送候选骑手
   * 参数：order DispatchOrderContext
   * 返回值：RiderCandidate[]（按距离 ASC 已天然排序，service 层评分后再排）
   */
  async findCandidates(order: DispatchOrderContext): Promise<RiderCandidate[]> {
    /* 1) GEO 检索 */
    const geoHits = await this.riderLocService.searchOnlineRiders(
      order.cityCode,
      order.pickupLng,
      order.pickupLat,
      DEFAULT_SEARCH_RADIUS_KM,
      MAX_GEO_CANDIDATES
    )
    if (geoHits.length === 0) {
      return []
    }

    /* 2) 批量查偏好（一次 IN 查询） */
    const riderIds = geoHits.map((h) => h.riderId)
    const preferences = await this.preferenceRepo.find({
      where: { riderId: In(riderIds), isDeleted: 0 }
    })
    const prefMap = new Map<string, RiderPreference>()
    for (const p of preferences) {
      prefMap.set(p.riderId, p)
    }

    /* 3) 批量查骑手主表（评分 / 状态） */
    const riders = await this.riderRepo.find({
      where: { id: In(riderIds), isDeleted: 0 }
    })
    const riderMap = new Map<string, Rider>()
    for (const r of riders) {
      riderMap.set(r.id, r)
    }

    /* 4) 逐个候选过滤 + 拼装 */
    const result: RiderCandidate[] = []
    for (const hit of geoHits) {
      const rider = riderMap.get(hit.riderId)
      if (!rider) continue
      if (rider.status !== 1) continue
      if (rider.onlineStatus === 0) continue

      const preference = prefMap.get(hit.riderId) ?? null
      if (!this.matchPreference(preference, order, hit.distanceKm * 1000)) continue

      const blacklisted = await this.blacklistService.isBlacklisted(
        BLACKLIST_TARGET_RIDER,
        hit.riderId
      )
      if (blacklisted) continue

      const currentOrders = await this.getActiveOrderCount(hit.riderId)
      const maxConcurrent = preference?.acceptMaxConcurrent ?? DEFAULT_MAX_CONCURRENT
      if (currentOrders >= maxConcurrent) continue

      result.push({
        riderId: hit.riderId,
        lng: hit.lng,
        lat: hit.lat,
        distanceKm: hit.distanceKm,
        distanceM: Math.round(hit.distanceKm * 1000),
        riderScore: this.parseScore(rider.score),
        currentOrders,
        maxConcurrent
      })
    }
    return result
  }

  /* ============================================================================
   * 偏好匹配
   * ============================================================================ */

  /**
   * 接单偏好兼容性校验
   * 参数：preference 偏好（无偏好 → 全部允许）；order 订单上下文；distanceM 米
   * 返回值：true 兼容
   */
  private matchPreference(
    preference: RiderPreference | null,
    order: DispatchOrderContext,
    distanceM: number
  ): boolean {
    if (!preference) {
      return distanceM <= DEFAULT_ACCEPT_RADIUS_M
    }

    /* 接单模式：必须支持系统派单（1 或 3） */
    if (
      preference.acceptMode !== AcceptModeEnum.SYSTEM_ONLY &&
      preference.acceptMode !== AcceptModeEnum.BOTH
    ) {
      return false
    }

    /* 接单半径 */
    if (distanceM > preference.acceptRadiusM) {
      return false
    }

    /* 订单类型偏好 */
    if (order.orderType === OrderTypeForDispatch.TAKEOUT) {
      if (preference.acceptTakeout !== 1) return false
    } else {
      if (preference.acceptErrand !== 1) return false
      const acceptedTypes = preference.errandTypes ?? []
      if (
        order.serviceType != null &&
        acceptedTypes.length > 0 &&
        !acceptedTypes.includes(order.serviceType)
      ) {
        return false
      }
    }
    return true
  }

  /* ============================================================================
   * 活跃订单数（Redis Set；维护接口由 GrabService / DispatchService 调用）
   * ============================================================================ */

  /**
   * 取骑手当前活跃订单数
   * 参数：riderId
   * 返回值：count
   */
  async getActiveOrderCount(riderId: string): Promise<number> {
    try {
      return await this.redis.scard(RIDER_ACTIVE_KEY(riderId))
    } catch (err) {
      this.logger.warn(
        `读 active orders 失败 rider=${riderId}：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
  }

  /**
   * 把订单挂到骑手活跃集合
   * 参数：riderId / orderNo
   * 返回值：当前活跃订单数（SADD 后的 SCARD）
   */
  async appendActiveOrder(riderId: string, orderNo: string): Promise<number> {
    try {
      const key = RIDER_ACTIVE_KEY(riderId)
      const pipeline = this.redis.multi()
      pipeline.sadd(key, orderNo)
      pipeline.expire(key, 24 * 3600)
      pipeline.scard(key)
      const results = await pipeline.exec()
      const lastResult = results?.at(-1)
      if (Array.isArray(lastResult)) {
        const [, count] = lastResult
        if (typeof count === 'number') return count
        if (typeof count === 'string') return Number(count)
      }
      return 0
    } catch (err) {
      this.logger.warn(
        `appendActiveOrder 失败 rider=${riderId} order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
  }

  /**
   * 把订单从骑手活跃集合移除
   * 参数：riderId / orderNo
   * 返回值：实际移除条数（0/1）
   */
  async removeActiveOrder(riderId: string, orderNo: string): Promise<number> {
    try {
      return await this.redis.srem(RIDER_ACTIVE_KEY(riderId), orderNo)
    } catch (err) {
      this.logger.warn(
        `removeActiveOrder 失败 rider=${riderId} order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
  }

  /* ============================================================================
   * Helper
   * ============================================================================ */

  /**
   * 把 rider.score（DECIMAL → string）解析为 number；非法则取 5（满分）
   */
  private parseScore(score: string | null | undefined): number {
    if (score == null) return 5
    const n = Number(score)
    if (!Number.isFinite(n)) return 5
    return Math.max(0, Math.min(5, n))
  }
}
