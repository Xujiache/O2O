import { ConfigService } from '@nestjs/config'
import { AmapProvider } from './amap.provider'

/**
 * AmapProvider 单元测试
 *
 * 覆盖：
 * - geocode 成功 / status=0 失败
 * - regeocode / distance / routing 基本路径
 * - 缺 AMAP_KEY 时抛 503
 * - HTTP 500 抛 502
 *
 * 用途：T3.24 关键路径
 */
describe('AmapProvider', () => {
  const originalFetch = globalThis.fetch
  let provider: AmapProvider
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
    const config = {
      get: <T>(key: string, def?: T): T => {
        const map: Record<string, unknown> = {
          'map.amapBaseUrl': 'https://restapi.amap.com',
          'map.amapKey': 'TEST_KEY',
          'map.httpTimeoutMs': 5000
        }
        return (map[key] as T) ?? (def as T)
      }
    } as unknown as ConfigService
    provider = new AmapProvider(config)
  })

  afterAll(() => {
    globalThis.fetch = originalFetch
  })

  /** 构造 fetch 返回 */
  const respond = (json: unknown, ok = true, status = 200): Response =>
    ({
      ok,
      status,
      json: async () => json
    }) as unknown as Response

  it('geocode 成功路径', async () => {
    fetchMock.mockResolvedValue(
      respond({
        status: '1',
        info: 'OK',
        infocode: '10000',
        geocodes: [
          {
            formatted_address: '北京市朝阳区望京 SOHO 塔1',
            location: '116.48,39.99',
            level: 'poi',
            citycode: '010',
            adcode: '110105'
          }
        ]
      })
    )
    const r = await provider.geocode('望京 SOHO 塔1', '北京')
    expect(r.lng).toBe(116.48)
    expect(r.lat).toBe(39.99)
    expect(r.cityCode).toBe('010')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('geocode status=0 → 抛 MAP_PROVIDER_ERROR', async () => {
    fetchMock.mockResolvedValue(
      respond({ status: '0', info: 'INVALID_PARAMS', infocode: '20001', geocodes: [] })
    )
    await expect(provider.geocode('xx')).rejects.toMatchObject({ status: 400 })
  })

  it('geocode geocodes 为空 → 抛 MAP_PROVIDER_ERROR', async () => {
    fetchMock.mockResolvedValue(
      respond({ status: '1', info: 'OK', infocode: '10000', geocodes: [] })
    )
    await expect(provider.geocode('xx')).rejects.toMatchObject({ status: 400 })
  })

  it('regeocode 成功路径', async () => {
    fetchMock.mockResolvedValue(
      respond({
        status: '1',
        info: 'OK',
        infocode: '10000',
        regeocode: {
          formatted_address: '北京市朝阳区望京街',
          addressComponent: {
            province: '北京市',
            city: '北京市',
            district: '朝阳区',
            citycode: '010',
            adcode: '110105'
          }
        }
      })
    )
    const r = await provider.regeocode(116.48, 39.99)
    expect(r.formatted).toBe('北京市朝阳区望京街')
    expect(r.district).toBe('朝阳区')
  })

  it('distance 成功路径', async () => {
    fetchMock.mockResolvedValue(
      respond({
        status: '1',
        info: 'OK',
        infocode: '10000',
        results: [{ origin_id: '1', dest_id: '1', distance: '8000', duration: '1000' }]
      })
    )
    const r = await provider.distance(116.48, 39.99, 116.4, 39.91, '1')
    expect(r.distance).toBe(8000)
    expect(r.type).toBe('driving')
  })

  it('routing 成功路径（driving）', async () => {
    fetchMock.mockResolvedValue(
      respond({
        status: '1',
        info: 'OK',
        infocode: '10000',
        route: {
          paths: [
            {
              distance: '8000',
              duration: '1000',
              steps: [{ polyline: '116.48,39.99;116.40,39.91' }]
            }
          ]
        }
      })
    )
    const r = await provider.routing(116.48, 39.99, 116.4, 39.91, 'driving')
    expect(r.distance).toBe(8000)
    expect(r.path.length).toBe(2)
    expect(r.type).toBe('driving')
  })

  it('HTTP 500 → 502', async () => {
    fetchMock.mockResolvedValue(respond({}, false, 500))
    await expect(provider.geocode('x')).rejects.toMatchObject({ status: 502 })
  })

  it('AMAP_KEY 缺失 → 503', async () => {
    const config = {
      get: <T>(key: string, def?: T): T => {
        if (key === 'map.amapBaseUrl') return 'https://restapi.amap.com' as unknown as T
        if (key === 'map.amapKey') return '' as unknown as T
        if (key === 'map.httpTimeoutMs') return 5000 as unknown as T
        return def as T
      }
    } as unknown as ConfigService
    const empty = new AmapProvider(config)
    await expect(empty.geocode('x')).rejects.toMatchObject({ status: 503 })
  })
})
