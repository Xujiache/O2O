/**
 * @file amap-server.provider.spec.ts
 * @stage P9/W5.B.2 (Sprint 5) — AmapServerProvider 单元测试
 * @desc 覆盖：缺凭证 no-op / 4 个核心方法 happy path / HTTP 4xx / 业务 status=0
 *
 * @author Agent B (P9 Sprint 5)
 */

import { ConfigService } from '@nestjs/config'
import { AmapServerProvider } from './amap-server.provider'

/* ============================================================================
 * Helpers
 * ============================================================================ */

function makeConfig(map: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T): T =>
      map[key] !== undefined ? (map[key] as unknown as T) : (def as T)
  } as unknown as ConfigService
}

function makeResp(status: number, body: unknown): Response {
  return {
    status,
    ok: status < 400,
    text: async (): Promise<string> => JSON.stringify(body)
  } as unknown as Response
}

function makeEnabledProvider(): AmapServerProvider {
  return new AmapServerProvider(
    makeConfig({
      AMAP_SERVER_KEY: 'TEST_AMAP_KEY',
      AMAP_SERVER_BASE_URL: 'https://restapi.amap.com'
    })
  )
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('AmapServerProvider', () => {
  let originalFetch: typeof fetch | undefined

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    if (originalFetch) global.fetch = originalFetch
    else (global as unknown as { fetch?: unknown }).fetch = undefined
    jest.restoreAllMocks()
  })

  /* ============================================================================ */
  /* 1) 缺凭证 → no-op                                                              */
  /* ============================================================================ */
  it('disabled 时所有方法走 no-op + console.warn', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const provider = new AmapServerProvider(makeConfig({}))
    expect(provider.enabled).toBe(false)

    const r1 = await provider.routeDriving(0, 0, 1, 1)
    expect(r1.ok).toBe(false)
    expect(r1.reason).toBe('disabled')

    const r2 = await provider.routeWalking(0, 0, 1, 1)
    expect(r2.ok).toBe(false)
    expect(r2.reason).toBe('disabled')

    const r3 = await provider.routeRiding(0, 0, 1, 1)
    expect(r3.ok).toBe(false)
    expect(r3.reason).toBe('disabled')

    const r4 = await provider.distanceMatrix([[116.48, 39.99]], [[116.5, 40.0]])
    expect(r4.ok).toBe(false)
    expect(r4.reason).toBe('disabled')

    const r5 = await provider.regeocodeHighPrecision(116.48, 39.99)
    expect(r5.ok).toBe(false)
    expect(r5.reason).toBe('disabled')

    expect(warn).toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 2) routeDriving happy path                                                     */
  /* ============================================================================ */
  it('routeDriving 成功：解析 distance / duration / polyline；URL 含 key', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(
      makeResp(200, {
        status: '1',
        info: 'OK',
        infocode: '10000',
        route: {
          paths: [
            {
              distance: '1234',
              duration: '300',
              polyline: 'AAA',
              steps: [{ polyline: 'BBB' }, { polyline: 'CCC' }]
            }
          ]
        }
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.routeDriving(116.48, 39.99, 116.5, 40.0, { strategy: 2 })
    expect(r.ok).toBe(true)
    expect(r.data?.distance).toBe(1234)
    expect(r.data?.duration).toBe(300)
    expect(r.data?.polyline).toBe('AAA;BBB;CCC')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/v3/direction/driving')
    expect(url).toContain('key=TEST_AMAP_KEY')
    expect(url).toContain('strategy=2')
    expect(url).toContain('extensions=all')
  })

  /* ============================================================================ */
  /* 3) routeWalking happy path                                                     */
  /* ============================================================================ */
  it('routeWalking 成功', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(
      makeResp(200, {
        status: '1',
        info: 'OK',
        infocode: '10000',
        route: {
          paths: [{ distance: '500', duration: '600', steps: [{ polyline: 'P1' }] }]
        }
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.routeWalking(116.48, 39.99, 116.5, 40.0)
    expect(r.ok).toBe(true)
    expect(r.data?.distance).toBe(500)
    expect(r.data?.duration).toBe(600)
    expect(r.data?.polyline).toBe('P1')

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/v3/direction/walking')
  })

  /* ============================================================================ */
  /* 4) routeRiding happy path（v4 接口）                                           */
  /* ============================================================================ */
  it('routeRiding 成功：解析 v4 结构', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(
      makeResp(200, {
        errcode: 0,
        errmsg: 'OK',
        data: {
          paths: [
            {
              distance: 800,
              duration: 240,
              steps: [{ polyline: 'X1' }, { polyline: 'X2' }]
            }
          ]
        }
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.routeRiding(116.48, 39.99, 116.5, 40.0)
    expect(r.ok).toBe(true)
    expect(r.data?.distance).toBe(800)
    expect(r.data?.duration).toBe(240)
    expect(r.data?.polyline).toBe('X1;X2')

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/v4/direction/bicycling')
  })

  /* ============================================================================ */
  /* 5) distanceMatrix happy path                                                   */
  /* ============================================================================ */
  it('distanceMatrix 成功：每个 destination 一次 fetch；二维矩阵正确', async () => {
    const provider = makeEnabledProvider()
    /* 2 origins × 2 destinations → 2 次 fetch */
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResp(200, {
          status: '1',
          info: 'OK',
          infocode: '10000',
          results: [
            { origin_id: '1', dest_id: '1', distance: '100', duration: '60' },
            { origin_id: '2', dest_id: '1', distance: '200', duration: '120' }
          ]
        })
      )
      .mockResolvedValueOnce(
        makeResp(200, {
          status: '1',
          info: 'OK',
          infocode: '10000',
          results: [
            { origin_id: '1', dest_id: '1', distance: '300', duration: '180' },
            { origin_id: '2', dest_id: '1', distance: '400', duration: '240' }
          ]
        })
      )
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.distanceMatrix(
      [
        [116.48, 39.99],
        [116.49, 39.98]
      ],
      [
        [116.5, 40.0],
        [116.51, 40.01]
      ]
    )
    expect(r.ok).toBe(true)
    expect(r.data?.distance).toEqual([
      [100, 300],
      [200, 400]
    ])
    expect(r.data?.duration).toEqual([
      [60, 180],
      [120, 240]
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const url0 = fetchMock.mock.calls[0][0] as string
    expect(url0).toContain('/v3/distance')
    expect(url0).toContain('origins=')
    expect(url0).toContain('type=1')
  })

  /* ============================================================================ */
  /* 6) regeocodeHighPrecision happy path                                           */
  /* ============================================================================ */
  it('regeocodeHighPrecision 成功：解析 POI / 道路 / aoi', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(
      makeResp(200, {
        status: '1',
        info: 'OK',
        infocode: '10000',
        regeocode: {
          formatted_address: '北京市朝阳区望京 SOHO',
          addressComponent: {
            province: '北京市',
            city: '北京市',
            district: '朝阳区',
            township: '望京街道'
          },
          pois: [{ id: 'POI1', name: '望京 SOHO', type: '商务楼宇', distance: '20' }],
          roads: [{ id: 'RD1', name: '阜通东大街', distance: '50' }],
          aois: [{ name: '望京 SOHO', distance: '0' }]
        }
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.regeocodeHighPrecision(116.48, 39.99)
    expect(r.ok).toBe(true)
    expect(r.data?.formatted).toBe('北京市朝阳区望京 SOHO')
    expect(r.data?.province).toBe('北京市')
    expect(r.data?.district).toBe('朝阳区')
    expect(r.data?.township).toBe('望京街道')
    expect(r.data?.pois.length).toBe(1)
    expect(r.data?.pois[0].name).toBe('望京 SOHO')
    expect(r.data?.pois[0].distance).toBe(20)
    expect(r.data?.roads.length).toBe(1)
    expect(r.data?.landmark?.name).toBe('望京 SOHO')

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/v3/geocode/regeo')
    expect(url).toContain('extensions=all')
    expect(url).toContain('radius=500')
  })

  /* ============================================================================ */
  /* 7) HTTP 4xx                                                                    */
  /* ============================================================================ */
  it('HTTP 403 → ok=false + reason=http_403', async () => {
    const provider = makeEnabledProvider()
    global.fetch = jest.fn().mockResolvedValue(makeResp(403, {})) as unknown as typeof fetch

    const r = await provider.routeDriving(0, 0, 1, 1)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('http_403')
  })

  /* ============================================================================ */
  /* 8) HTTP 500                                                                    */
  /* ============================================================================ */
  it('HTTP 500 → ok=false + reason=http_500', async () => {
    const provider = makeEnabledProvider()
    global.fetch = jest.fn().mockResolvedValue(makeResp(500, {})) as unknown as typeof fetch

    const r = await provider.routeWalking(0, 0, 1, 1)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('http_500')
  })

  /* ============================================================================ */
  /* 9) status=0 业务错误                                                           */
  /* ============================================================================ */
  it('routeDriving status=0 → ok=false + reason=amap_status_<infocode>', async () => {
    const provider = makeEnabledProvider()
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeResp(200, { status: '0', info: 'INVALID_PARAMS', infocode: '20001' })
      ) as unknown as typeof fetch

    const r = await provider.routeDriving(0, 0, 1, 1)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('amap_status_20001')
  })

  /* ============================================================================ */
  /* 10) routeRiding errcode 非 0                                                   */
  /* ============================================================================ */
  it('routeRiding errcode 非 0 → ok=false', async () => {
    const provider = makeEnabledProvider()
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeResp(200, { errcode: 30001, errmsg: 'fail' })
      ) as unknown as typeof fetch

    const r = await provider.routeRiding(0, 0, 1, 1)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('amap_errcode_30001')
  })

  /* ============================================================================ */
  /* 11) fetch 抛错 → network_error                                                 */
  /* ============================================================================ */
  it('fetch 抛错 → ok=false + reason=network_error（不抛）', async () => {
    const provider = makeEnabledProvider()
    global.fetch = jest.fn().mockRejectedValue(new Error('ETIMEDOUT')) as unknown as typeof fetch

    const r = await provider.routeDriving(0, 0, 1, 1)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('network_error')
  })

  /* ============================================================================ */
  /* 12) distanceMatrix 空入参                                                      */
  /* ============================================================================ */
  it('distanceMatrix 空 origins / destinations → empty_origins_or_destinations', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.distanceMatrix([], [[1, 1]])
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('empty_origins_or_destinations')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 13) routeDriving paths 为空                                                    */
  /* ============================================================================ */
  it('routeDriving 无 paths → ok=false + reason=no_path', async () => {
    const provider = makeEnabledProvider()
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        makeResp(200, { status: '1', info: 'OK', infocode: '10000', route: { paths: [] } })
      ) as unknown as typeof fetch

    const r = await provider.routeDriving(0, 0, 1, 1)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('no_path')
  })
})
