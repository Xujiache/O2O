/**
 * @file scoring.service.spec.ts
 * @stage P4/T4.52（Sprint 8）
 * @desc ScoringService 单测：评分公式 + 默认权重 + sys_config 动态权重 + 距离衰减 + 罚分
 * @author 单 Agent V2.0（Subagent 7）
 *
 * 关键覆盖：
 *   1) 默认权重 40/30/20/10 + 单候选无拒单 → finalScore 在合理区间
 *   2) distanceScore = exp(-distKm/3) 单调递减
 *   3) capacityScore = 1 - currentOrders/maxConcurrent
 *   4) routeMatchScore 0/1
 *   5) riderRatingScore = score/5
 *   6) penalty = recentRejectCount * 0.1
 *   7) sys_config 配置注入 → loadWeights 走 DB 路径
 *   8) sys_config 缺失 → 走默认权重
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import { REDIS_CLIENT } from '@/health/redis.provider'
import {
  DEFAULT_SCORING_WEIGHTS,
  type DispatchOrderContext,
  type RiderCandidate
} from '../types/dispatch.types'
import { OrderTypeForDispatch } from '../types/dispatch.types'
import { RouteMatchService } from './route-match.service'
import { ScoringService } from './scoring.service'

describe('ScoringService', () => {
  let service: ScoringService
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock }
  let dataSourceQuery: jest.Mock
  let routeMatchScoreFor: jest.Mock

  const buildOrder = (over: Partial<DispatchOrderContext> = {}): DispatchOrderContext => ({
    orderNo: 'T20260419000001234',
    orderType: OrderTypeForDispatch.TAKEOUT,
    serviceType: null,
    cityCode: '110000',
    pickupLng: 116.4,
    pickupLat: 39.9,
    deliveryLng: 116.5,
    deliveryLat: 40.0,
    ...over
  })

  const buildCandidate = (over: Partial<RiderCandidate> = {}): RiderCandidate => ({
    riderId: 'R1',
    lng: 116.4,
    lat: 39.9,
    distanceKm: 1.0,
    distanceM: 1000,
    riderScore: 5,
    currentOrders: 0,
    maxConcurrent: 5,
    ...over
  })

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    }
    dataSourceQuery = jest.fn().mockResolvedValue([])
    routeMatchScoreFor = jest.fn().mockResolvedValue(1)

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        { provide: REDIS_CLIENT, useValue: redis },
        {
          provide: getDataSourceToken(),
          useValue: { query: dataSourceQuery }
        },
        {
          provide: RouteMatchService,
          useValue: { scoreFor: routeMatchScoreFor }
        }
      ]
    }).compile()

    service = moduleRef.get(ScoringService)
  })

  describe('weights loading', () => {
    it('default weights when sys_config missing', async () => {
      dataSourceQuery.mockResolvedValueOnce([])
      const weights = await service.loadWeights()
      expect(weights).toEqual(DEFAULT_SCORING_WEIGHTS)
      expect(redis.set).toHaveBeenCalled()
    })

    it('weights from sys_config', async () => {
      dataSourceQuery.mockResolvedValueOnce([
        {
          config_value: JSON.stringify({
            distance: 50,
            capacity: 30,
            routeMatch: 10,
            rating: 10
          })
        }
      ])
      const weights = await service.loadWeights()
      expect(weights.distance).toBe(50)
      expect(weights.routeMatch).toBe(10)
    })

    it('uses Redis cache when present', async () => {
      redis.get.mockResolvedValueOnce(
        JSON.stringify({ distance: 99, capacity: 1, routeMatch: 0, rating: 0 })
      )
      const weights = await service.loadWeights()
      expect(weights.distance).toBe(99)
      expect(dataSourceQuery).not.toHaveBeenCalled()
    })

    it('invalid JSON in sys_config falls back to defaults', async () => {
      dataSourceQuery.mockResolvedValueOnce([{ config_value: '{ bad-json' }])
      const weights = await service.loadWeights()
      expect(weights).toEqual(DEFAULT_SCORING_WEIGHTS)
    })
  })

  describe('score formula', () => {
    it('default weights + perfect candidate -> high finalScore', async () => {
      const breakdown = await service.score(buildCandidate(), buildOrder())
      expect(breakdown.distanceScore).toBeGreaterThan(0.7)
      expect(breakdown.capacityScore).toBe(1)
      expect(breakdown.routeMatchScore).toBe(1)
      expect(breakdown.riderRatingScore).toBe(1)
      expect(breakdown.penalty).toBe(0)
      expect(breakdown.finalScore).toBeGreaterThan(70)
    })

    it('distance decays: 6km < 1km score', async () => {
      const closeBd = await service.score(buildCandidate({ distanceKm: 1 }), buildOrder())
      const farBd = await service.score(buildCandidate({ distanceKm: 6 }), buildOrder())
      expect(closeBd.distanceScore).toBeGreaterThan(farBd.distanceScore)
      expect(closeBd.finalScore).toBeGreaterThan(farBd.finalScore)
    })

    it('capacity decreases as currentOrders rises', async () => {
      const empty = await service.score(
        buildCandidate({ currentOrders: 0, maxConcurrent: 5 }),
        buildOrder()
      )
      const half = await service.score(
        buildCandidate({ currentOrders: 3, maxConcurrent: 5 }),
        buildOrder()
      )
      expect(empty.capacityScore).toBe(1)
      expect(half.capacityScore).toBeCloseTo(0.4, 4)
    })

    it('routeMatch=0 reduces score', async () => {
      routeMatchScoreFor.mockResolvedValue(0)
      const noMatch = await service.score(buildCandidate(), buildOrder())
      routeMatchScoreFor.mockResolvedValue(1)
      const match = await service.score(buildCandidate(), buildOrder())
      expect(match.finalScore).toBeGreaterThan(noMatch.finalScore)
    })

    it('rider rating 2.5 -> riderRatingScore=0.5', async () => {
      const breakdown = await service.score(buildCandidate({ riderScore: 2.5 }), buildOrder())
      expect(breakdown.riderRatingScore).toBe(0.5)
    })

    it('reject penalty: 3 rejects -> penalty=0.3', async () => {
      dataSourceQuery
        .mockResolvedValueOnce([]) /* loadWeights sys_config */
        .mockResolvedValueOnce([{ cnt: 3 }]) /* count rejects */
      const breakdown = await service.score(buildCandidate(), buildOrder())
      expect(breakdown.penalty).toBe(0.3)
    })

    it('maxConcurrent=0 -> capacityScore=0', async () => {
      const breakdown = await service.score(
        buildCandidate({ currentOrders: 0, maxConcurrent: 0 }),
        buildOrder()
      )
      expect(breakdown.capacityScore).toBe(0)
    })
  })

  describe('cache invalidation', () => {
    it('invalidateWeightsCache deletes redis key', async () => {
      await service.invalidateWeightsCache()
      expect(redis.del).toHaveBeenCalled()
    })
  })
})
