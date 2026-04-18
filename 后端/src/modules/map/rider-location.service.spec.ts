import { ConfigService } from '@nestjs/config'
import { Test, type TestingModule } from '@nestjs/testing'
import { REDIS_CLIENT } from '@/health/redis.provider'
import {
  InMemoryRiderLocationPublisher,
  RIDER_LOCATION_PUBLISHER
} from './rabbitmq/rider-location.publisher'
import { RiderLocationService } from './rider-location.service'

/**
 * RiderLocationService 单元测试
 *
 * 覆盖：
 * - reportBatch 同步写 Redis Hash + GEO；异步投递 Publisher
 * - 全部 lng/lat 越界 → 抛 BusinessException
 * - searchOnlineRiders GEO 搜索（mock）
 *
 * 用途：T3.24 关键路径
 */
describe('RiderLocationService', () => {
  let service: RiderLocationService
  let publisher: InMemoryRiderLocationPublisher
  let pipelineExec: jest.Mock
  let geosearchMock: jest.Mock

  beforeEach(async () => {
    pipelineExec = jest.fn().mockResolvedValue([
      [null, 1],
      [null, 1],
      [null, 1]
    ])
    geosearchMock = jest.fn().mockResolvedValue([
      ['R1', '0.5', ['116.481', '39.991']],
      ['R2', '1.2', ['116.482', '39.992']]
    ])
    const fakePipeline = {
      hset: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      geoadd: jest.fn().mockReturnThis(),
      exec: pipelineExec
    }
    const fakeRedis = {
      multi: jest.fn().mockReturnValue(fakePipeline),
      geosearch: geosearchMock
    }

    publisher = new InMemoryRiderLocationPublisher()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiderLocationService,
        { provide: REDIS_CLIENT, useValue: fakeRedis },
        { provide: RIDER_LOCATION_PUBLISHER, useValue: publisher },
        { provide: ConfigService, useValue: { get: <T>(_k: string, def?: T) => def as T } }
      ]
    }).compile()

    service = module.get(RiderLocationService)
  })

  it('reportBatch 同步写 Redis + 异步投递', async () => {
    const captured: { batchId: string; count: number }[] = []
    publisher.setListener(async (payloads, batchId) => {
      captured.push({ batchId, count: payloads.length })
    })
    const r = await service.reportBatch({
      riderId: 'R1',
      cityCode: '110100',
      locations: [
        {
          ts: 1745040000000,
          lng: 116.48,
          lat: 39.99,
          speedKmh: 18,
          dir: 90,
          battery: 80,
          orderNo: null
        }
      ]
    })
    expect(r.accepted).toBe(1)
    expect(r.geoUpdated).toBe(true)
    expect(r.batchId.startsWith('rider-loc-')).toBe(true)
    expect(captured.length).toBe(1)
    expect(captured[0]!.count).toBe(1)
    expect(pipelineExec).toHaveBeenCalled()
  })

  it('reportBatch 全部坐标非法 → 400', async () => {
    await expect(
      service.reportBatch({
        riderId: 'R1',
        cityCode: '110100',
        locations: [{ ts: 1745040000000, lng: 999, lat: 999, orderNo: null }]
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('reportBatch 部分非法 → 仍接收合法点', async () => {
    publisher.setListener(async () => undefined)
    const r = await service.reportBatch({
      riderId: 'R1',
      cityCode: '110100',
      locations: [
        { ts: 1, lng: 999, lat: 999 },
        { ts: 2, lng: 116.48, lat: 39.99 },
        { ts: 3, lng: 116.49, lat: 39.98 }
      ]
    })
    expect(r.accepted).toBe(2)
  })

  it('searchOnlineRiders 走 GEOSEARCH', async () => {
    const list = await service.searchOnlineRiders('110100', 116.48, 39.99, 5)
    expect(list.length).toBe(2)
    expect(list[0]!.riderId).toBe('R1')
    expect(list[0]!.distanceKm).toBe(0.5)
    expect(geosearchMock).toHaveBeenCalledWith(
      'rider:online:110100',
      'FROMLONLAT',
      116.48,
      39.99,
      'BYRADIUS',
      5,
      'km',
      'ASC',
      'COUNT',
      50,
      'WITHCOORD',
      'WITHDIST'
    )
  })
})
