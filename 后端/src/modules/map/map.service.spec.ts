import { ConfigService } from '@nestjs/config'
import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { MapService } from './map.service'
import { AmapProvider } from './providers/amap.provider'
import { TIMESCALE_POOL } from './timescale/timescale.provider'

/**
 * MapService 单元测试
 *
 * 覆盖：
 * - distance(type=0) 应用层 Haversine（不调高德）
 * - withinArea：缓存命中 + 缓存 miss → DB 查询
 * - queryTrack：mock pg.Pool → 返回 GeoJSON LineString
 *
 * 用途：T3.24 关键路径
 */
describe('MapService', () => {
  let service: MapService
  let redisStore: Map<string, string>
  let amapMock: jest.Mocked<AmapProvider>
  let queryBuilderMock: { getRawOne: jest.Mock }
  let dataSourceMock: { createQueryBuilder: jest.Mock }
  let poolQueryMock: jest.Mock

  beforeEach(async () => {
    redisStore = new Map()
    const fakeRedis = {
      get: jest.fn().mockImplementation(async (k: string) => redisStore.get(k) ?? null),
      set: jest.fn().mockImplementation(async (k: string, v: string) => {
        redisStore.set(k, v)
        return 'OK'
      }),
      exists: jest.fn().mockImplementation(async (k: string) => (redisStore.has(k) ? 1 : 0))
    }
    amapMock = {
      geocode: jest.fn().mockResolvedValue({
        lng: 116.48,
        lat: 39.99,
        level: 'poi',
        formatted: 'X',
        cityCode: '010',
        adcode: '110105'
      }),
      regeocode: jest.fn().mockResolvedValue({
        formatted: 'X',
        province: '北京市',
        city: '北京市',
        district: '朝阳区',
        cityCode: '010',
        adcode: '110105'
      }),
      distance: jest.fn().mockResolvedValue({ distance: 8000, duration: 1000, type: 'driving' }),
      routing: jest.fn().mockResolvedValue({
        distance: 8000,
        duration: 1000,
        path: [
          [116.48, 39.99],
          [116.4, 39.91]
        ],
        type: 'driving'
      })
    } as unknown as jest.Mocked<AmapProvider>
    queryBuilderMock = { getRawOne: jest.fn() }
    const chain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: queryBuilderMock.getRawOne
    }
    dataSourceMock = { createQueryBuilder: jest.fn().mockReturnValue(chain) }

    poolQueryMock = jest.fn()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MapService,
        { provide: REDIS_CLIENT, useValue: fakeRedis },
        { provide: AmapProvider, useValue: amapMock },
        { provide: getDataSourceToken(), useValue: dataSourceMock },
        { provide: TIMESCALE_POOL, useValue: { query: poolQueryMock } },
        { provide: ConfigService, useValue: { get: <T>(_k: string, def?: T) => def as T } }
      ]
    }).compile()

    service = module.get(MapService)
  })

  describe('distance', () => {
    it('type=0 应走应用层 Haversine（不调高德）', async () => {
      const r = await service.distance(116.40739, 39.90402, 116.32213, 39.89396, '0')
      expect(amapMock.distance).not.toHaveBeenCalled()
      expect(r.type).toBe('line')
      expect(r.distance).toBeGreaterThan(6000)
      expect(r.distance).toBeLessThan(8000)
    })
    it('type=1 应调高德 driving', async () => {
      const r = await service.distance(116.4, 39.9, 116.5, 39.91, '1')
      expect(amapMock.distance).toHaveBeenCalledWith(116.4, 39.9, 116.5, 39.91, '1')
      expect(r.distance).toBe(8000)
    })
  })

  describe('withinArea', () => {
    const polygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [116.47, 39.99],
          [116.49, 39.99],
          [116.49, 39.97],
          [116.47, 39.97],
          [116.47, 39.99]
        ]
      ]
    }

    it('缓存命中：直接返回（不查 DB）', async () => {
      redisStore.set(
        'shop:deliveryArea:S1',
        JSON.stringify({ areaId: 'A1', polygon, deliveryFee: 5, minOrder: 20 })
      )
      const r = await service.withinArea({ shopId: 'S1', lng: 116.48, lat: 39.98 })
      expect(r.within).toBe(true)
      expect(r.areaId).toBe('A1')
      expect(r.deliveryFee).toBe(5)
      expect(dataSourceMock.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('缓存 miss → DB 查询，再判定', async () => {
      queryBuilderMock.getRawOne.mockResolvedValue({
        id: 'A2',
        polygon: JSON.stringify(polygon),
        deliveryFee: '6.50',
        minOrder: '30.00'
      })
      const r = await service.withinArea({ shopId: 'S2', lng: 116.46, lat: 39.98 })
      expect(r.within).toBe(false)
      expect(dataSourceMock.createQueryBuilder).toHaveBeenCalled()
      // 已写回缓存
      expect(redisStore.get('shop:deliveryArea:S2')).toBeDefined()
    })

    it('DB 也无配送区 → within=false', async () => {
      queryBuilderMock.getRawOne.mockResolvedValue(undefined)
      const r = await service.withinArea({ shopId: 'S3', lng: 116.48, lat: 39.98 })
      expect(r.within).toBe(false)
    })

    it('lng/lat 越界 → 400', async () => {
      await expect(service.withinArea({ shopId: 'S1', lng: 999, lat: 999 })).rejects.toMatchObject({
        status: 400
      })
    })
  })

  describe('queryTrack', () => {
    it('返回 GeoJSON LineString + 累计距离 + 平均速度', async () => {
      poolQueryMock.mockResolvedValue({
        rows: [
          { ts_ms: '1745040000000', lng: 116.48, lat: 39.99, speed_kmh: 18 },
          { ts_ms: '1745040600000', lng: 116.40739, lat: 39.90402, speed_kmh: 22 }
        ]
      })
      const r = await service.queryTrack('R1', 'T20260419')
      expect(r.pointCount).toBe(2)
      expect(r.geometry.type).toBe('LineString')
      expect(r.geometry.coordinates.length).toBe(2)
      expect(r.properties.totalDistanceM).toBeGreaterThan(0)
      expect(r.properties.endMs).toBe(1745040600000)
    })
    it('TimescaleDB 抛错 → 502', async () => {
      poolQueryMock.mockRejectedValue(new Error('connection refused'))
      await expect(service.queryTrack('R1', 'T1')).rejects.toMatchObject({ status: 502 })
    })
  })

  describe('shop-area 预热', () => {
    const polygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [116.47, 39.99],
          [116.49, 39.99],
          [116.49, 39.97],
          [116.47, 39.97],
          [116.47, 39.99]
        ]
      ]
    }
    it('overwrite=true 强制写入', async () => {
      await service.setShopArea({ shopId: 'S9', polygon, overwrite: true })
      expect(redisStore.has('shop:deliveryArea:S9')).toBe(true)
    })
    it('overwrite=false 已存在则不写', async () => {
      redisStore.set('shop:deliveryArea:S10', JSON.stringify({ x: 1 }))
      await service.setShopArea({ shopId: 'S10', polygon, overwrite: false })
      const cached = JSON.parse(redisStore.get('shop:deliveryArea:S10') ?? '{}')
      expect(cached.x).toBe(1)
    })
  })
})
