/**
 * @file scoring.service.ts
 * @stage P4/T4.38（Sprint 6）
 * @desc 候选骑手评分（多因素加权）+ 权重配置化（sys_config dispatch.scoring）
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 评分公式（CONSENSUS_P4 §2.3）：
 *   score = w1*distanceScore + w2*capacityScore + w3*routeMatchScore + w4*riderRatingScore - penalty
 *
 * 子项细则：
 *   distanceScore  = exp(-distanceKm / 3)            ∈ (0,1]
 *   capacityScore  = 1 - currentOrders / maxConcurrent ∈ [0,1]
 *   routeMatchScore= 顺路 1.0 / 非顺路 0
 *   riderRatingScore = riderScore / 5                ∈ [0,1]
 *   penalty        = recentRejectCount * 0.1
 *
 * 默认权重（sys_config dispatch.scoring 缺失时）：
 *   distance=40 / capacity=30 / routeMatch=20 / rating=10
 *
 * sys_config 读取：
 *   - 直接 query sys_config WHERE config_key='dispatch.scoring'（值类型 = JSON）
 *   - 30s Redis Cache 兜底；DB 异常时退回默认值并打 warn
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import type Redis from 'ioredis'
import { DataSource } from 'typeorm'
import { REDIS_CLIENT } from '@/health/redis.provider'
import {
  DEFAULT_SCORING_WEIGHTS,
  DispatchStatusEnum,
  type DispatchOrderContext,
  type RiderCandidate,
  type ScoringBreakdown,
  type ScoringWeights
} from '../types/dispatch.types'
import { RouteMatchService } from './route-match.service'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** 评分权重 sys_config key */
const SCORING_CONFIG_KEY = 'dispatch.scoring'

/** 评分权重 Redis 缓存 Key + TTL */
const WEIGHTS_CACHE_KEY = 'sys:dispatch:scoring:weights'
const WEIGHTS_CACHE_TTL_S = 30

/** 距离衰减分母（km）：exp(-d/3) */
const DISTANCE_DECAY_KM = 3

/** 拒单罚分单系数：每条罚 0.1 */
const REJECT_PENALTY_PER_RECORD = 0.1

/** 拒单统计窗口：近 2 小时 */
const REJECT_WINDOW_MS = 2 * 60 * 60 * 1000

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly routeMatchService: RouteMatchService
  ) {}

  /* ============================================================================
   * 主入口：score
   * ============================================================================ */

  /**
   * 对单个候选骑手计算评分
   * 参数：candidate 候选骑手；order 订单上下文
   * 返回值：ScoringBreakdown（含子项 + finalScore + 实际使用的 weights）
   */
  async score(candidate: RiderCandidate, order: DispatchOrderContext): Promise<ScoringBreakdown> {
    const weights = await this.loadWeights()
    const distanceScore = Math.exp(-candidate.distanceKm / DISTANCE_DECAY_KM)
    const capacityScore =
      candidate.maxConcurrent > 0
        ? Math.max(0, 1 - candidate.currentOrders / candidate.maxConcurrent)
        : 0
    const routeMatchScore = await this.routeMatchService.scoreFor(candidate.riderId, order)
    const riderRatingScore = Math.max(0, Math.min(1, candidate.riderScore / 5))
    const penalty = await this.computeRejectPenalty(candidate.riderId)

    const finalScore = new BigNumber(weights.distance)
      .times(distanceScore)
      .plus(new BigNumber(weights.capacity).times(capacityScore))
      .plus(new BigNumber(weights.routeMatch).times(routeMatchScore))
      .plus(new BigNumber(weights.rating).times(riderRatingScore))
      .minus(penalty)
      .decimalPlaces(4, BigNumber.ROUND_HALF_UP)
      .toNumber()

    return {
      distanceScore: this.round4(distanceScore),
      capacityScore: this.round4(capacityScore),
      routeMatchScore,
      riderRatingScore: this.round4(riderRatingScore),
      penalty: this.round4(penalty),
      distanceM: candidate.distanceM,
      finalScore,
      weights
    }
  }

  /* ============================================================================
   * 权重加载（带 Redis Cache 兜底）
   * ============================================================================ */

  /**
   * 读取评分权重
   *   1) Redis 30s 缓存命中即返回
   *   2) miss → 查 sys_config（config_key=dispatch.scoring）
   *   3) 解析 JSON → 兜底校验字段 → 写回缓存
   *   4) 任一步异常 → 返回默认权重 + 打 warn
   */
  async loadWeights(): Promise<ScoringWeights> {
    const cached = await this.safeGetWeights(WEIGHTS_CACHE_KEY)
    if (cached) return cached

    let weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
    try {
      const rows = await this.dataSource.query<Array<{ config_value: string | null }>>(
        `SELECT config_value FROM sys_config WHERE config_key = ? AND is_deleted = 0 LIMIT 1`,
        [SCORING_CONFIG_KEY]
      )
      const raw = rows[0]?.config_value
      if (raw) {
        weights = this.parseWeights(raw)
      }
    } catch (err) {
      this.logger.warn(
        `读取 sys_config ${SCORING_CONFIG_KEY} 失败，使用默认权重：` +
          (err instanceof Error ? err.message : String(err))
      )
    }
    await this.safeSetWeights(WEIGHTS_CACHE_KEY, weights, WEIGHTS_CACHE_TTL_S)
    return weights
  }

  /**
   * 解析 JSON 字符串为 ScoringWeights，缺字段时与默认权重合并
   */
  private parseWeights(raw: string): ScoringWeights {
    try {
      const json = JSON.parse(raw) as Partial<ScoringWeights>
      return {
        distance: this.normalizeWeight(json.distance, DEFAULT_SCORING_WEIGHTS.distance),
        capacity: this.normalizeWeight(json.capacity, DEFAULT_SCORING_WEIGHTS.capacity),
        routeMatch: this.normalizeWeight(json.routeMatch, DEFAULT_SCORING_WEIGHTS.routeMatch),
        rating: this.normalizeWeight(json.rating, DEFAULT_SCORING_WEIGHTS.rating)
      }
    } catch (err) {
      this.logger.warn(
        `解析 dispatch.scoring 配置失败：${err instanceof Error ? err.message : String(err)}`
      )
      return DEFAULT_SCORING_WEIGHTS
    }
  }

  /**
   * 单字段权重归一化：必须是非负有限数；否则取默认值
   */
  private normalizeWeight(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
    return value
  }

  /* ============================================================================
   * 罚分（近 2h 拒单次数 * 0.1）
   * ============================================================================ */

  /**
   * 近 2 小时被拒派单次数（dispatch_record.status=2 拒绝）
   * 参数：riderId
   * 返回值：penalty（最大 = REJECT_PENALTY_PER_RECORD * count）
   */
  private async computeRejectPenalty(riderId: string): Promise<number> {
    try {
      const since = new Date(Date.now() - REJECT_WINDOW_MS)
      const rows = await this.dataSource.query<Array<{ cnt: string | number }>>(
        `SELECT COUNT(*) AS cnt FROM dispatch_record
          WHERE rider_id = ? AND status = ? AND created_at >= ? AND is_deleted = 0`,
        [riderId, DispatchStatusEnum.REJECTED, since]
      )
      const count = rows[0]?.cnt != null ? Number(rows[0].cnt) : 0
      return count * REJECT_PENALTY_PER_RECORD
    } catch (err) {
      this.logger.warn(
        `computeRejectPenalty 失败 rider=${riderId}：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
  }

  /* ============================================================================
   * Helper
   * ============================================================================ */

  private round4(value: number): number {
    return new BigNumber(value).decimalPlaces(4, BigNumber.ROUND_HALF_UP).toNumber()
  }

  /**
   * Redis 安全读取
   */
  private async safeGetWeights(key: string): Promise<ScoringWeights | null> {
    try {
      const raw = await this.redis.get(key)
      if (!raw) return null
      return JSON.parse(raw) as ScoringWeights
    } catch (err) {
      this.logger.warn(
        `safeGetWeights 失败 ${key}：${err instanceof Error ? err.message : String(err)}`
      )
      return null
    }
  }

  /**
   * Redis 安全写入（异常时仅 log，不影响业务）
   */
  private async safeSetWeights(key: string, value: ScoringWeights, ttlS: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlS)
    } catch (err) {
      this.logger.warn(
        `safeSetWeights 失败 ${key}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /* ============================================================================
   * 仅供测试 / 自检：清缓存
   * ============================================================================ */

  /**
   * 清空权重缓存（运营调权后调用，使下次评分立即生效）
   */
  async invalidateWeightsCache(): Promise<void> {
    try {
      await this.redis.del(WEIGHTS_CACHE_KEY)
    } catch (err) {
      this.logger.warn(
        `invalidateWeightsCache 失败：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}
