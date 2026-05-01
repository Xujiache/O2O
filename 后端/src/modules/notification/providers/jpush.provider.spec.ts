/**
 * @file jpush.provider.spec.ts
 * @stage P9/W5.B.1 (Sprint 5) — JPushProvider 单元测试
 * @desc 覆盖：缺凭证 no-op / 4 个推送方法 happy path / HTTP 4xx 错误 / body 格式断言
 *
 * 测试策略：
 *   - 全局 fetch mock：jest.fn() 替换；每个 test 配置不同响应
 *   - 用 ConfigService stub 注入凭证
 *
 * @author Agent B (P9 Sprint 5)
 */

import { ConfigService } from '@nestjs/config'
import { JPushProvider } from './jpush.provider'

/* ============================================================================
 * Helpers
 * ============================================================================ */

/** 构造一个 ConfigService stub */
function makeConfig(map: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T): T =>
      map[key] !== undefined ? (map[key] as unknown as T) : (def as T)
  } as unknown as ConfigService
}

/** 构造 fetch 返回 */
function makeResp(status: number, body: unknown): Response {
  return {
    status,
    ok: status < 400,
    text: async (): Promise<string> => JSON.stringify(body)
  } as unknown as Response
}

/** 构造一个 enabled provider */
function makeEnabledProvider(extra: Record<string, string> = {}): JPushProvider {
  return new JPushProvider(
    makeConfig({
      JPUSH_APP_KEY: 'TEST_APP_KEY',
      JPUSH_MASTER_SECRET: 'TEST_MASTER_SECRET',
      JPUSH_BASE_URL: 'https://api.jpush.cn',
      ...extra
    })
  )
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('JPushProvider', () => {
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
    const provider = new JPushProvider(makeConfig({}))
    expect(provider.enabled).toBe(false)

    const r1 = await provider.pushByRegistrationId(['rid1'], 't', 'c')
    expect(r1.ok).toBe(false)
    expect(r1.reason).toBe('disabled')

    const r2 = await provider.pushByAlias(['user-1'], 't', 'c')
    expect(r2.ok).toBe(false)
    expect(r2.reason).toBe('disabled')

    const r3 = await provider.pushByTag(['rider'], 't', 'c')
    expect(r3.ok).toBe(false)
    expect(r3.reason).toBe('disabled')

    const r4 = await provider.pushAll('t', 'c')
    expect(r4.ok).toBe(false)
    expect(r4.reason).toBe('disabled')

    /* 至少一次 disabled warn（构造时 + 4 次方法调用） */
    expect(warn).toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 2) pushByRegistrationId happy path + body 格式断言                             */
  /* ============================================================================ */
  it('pushByRegistrationId 成功：mock fetch 返回 sendno + msg_id；body / Auth 正确', async () => {
    const provider = makeEnabledProvider()
    expect(provider.enabled).toBe(true)

    const fetchMock = jest.fn().mockResolvedValue(makeResp(200, { sendno: 'SN1', msg_id: 'MID1' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.pushByRegistrationId(
      ['RID-AAA', 'RID-BBB'],
      '订单已接单',
      '请在 30 分钟内取餐',
      { orderNo: 'O001', type: 'order_accepted' }
    )
    expect(r.ok).toBe(true)
    expect(r.msgId).toBe('MID1')
    expect(r.sendNo).toBe('SN1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.jpush.cn/v3/push')
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    /* base64('TEST_APP_KEY:TEST_MASTER_SECRET') */
    const expectedAuth = Buffer.from('TEST_APP_KEY:TEST_MASTER_SECRET').toString('base64')
    expect(headers.Authorization).toBe(`Basic ${expectedAuth}`)
    expect(headers['Content-Type']).toBe('application/json')

    /* body 结构断言 */
    const parsedBody = JSON.parse(init.body as string) as Record<string, unknown>
    expect(parsedBody.platform).toBe('all')
    const audience = parsedBody.audience as Record<string, unknown>
    expect(audience.registration_id).toEqual(['RID-AAA', 'RID-BBB'])
    const notification = parsedBody.notification as Record<string, unknown>
    expect(notification.alert).toBe('请在 30 分钟内取餐')
    const android = notification.android as Record<string, unknown>
    expect(android.title).toBe('订单已接单')
    const options = parsedBody.options as Record<string, unknown>
    expect(options.apns_production).toBe(false)
  })

  /* ============================================================================ */
  /* 3) pushByAlias happy path                                                      */
  /* ============================================================================ */
  it('pushByAlias 成功：audience.alias 正确', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(makeResp(200, { sendno: 'SN2', msg_id: 'MID2' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.pushByAlias(['user-100', 'user-200'], 'T', 'C')
    expect(r.ok).toBe(true)
    expect(r.msgId).toBe('MID2')

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>
    const audience = parsed.audience as Record<string, unknown>
    expect(audience.alias).toEqual(['user-100', 'user-200'])
  })

  /* ============================================================================ */
  /* 4) pushByTag happy path                                                        */
  /* ============================================================================ */
  it('pushByTag 成功：audience.tag 正确', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(makeResp(200, { sendno: 'SN3', msg_id: 'MID3' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.pushByTag(['rider'], 'T', 'C')
    expect(r.ok).toBe(true)
    expect(r.sendNo).toBe('SN3')

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>
    const audience = parsed.audience as Record<string, unknown>
    expect(audience.tag).toEqual(['rider'])
  })

  /* ============================================================================ */
  /* 5) pushAll happy path                                                          */
  /* ============================================================================ */
  it('pushAll 成功：audience === "all"', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(makeResp(200, { sendno: 'SN4', msg_id: 'MID4' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.pushAll('T', 'C')
    expect(r.ok).toBe(true)

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>
    expect(parsed.audience).toBe('all')
  })

  /* ============================================================================ */
  /* 6) HTTP 4xx 错误                                                              */
  /* ============================================================================ */
  it('HTTP 401 → ok=false + reason=http_401', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest
      .fn()
      .mockResolvedValue(makeResp(401, { error: { code: 1001, message: 'unauthorized' } }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.pushByAlias(['u'], 'T', 'C')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('http_401')
  })

  /* ============================================================================ */
  /* 7) HTTP 5xx 错误                                                              */
  /* ============================================================================ */
  it('HTTP 503 → ok=false + reason=http_503', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest
      .fn()
      .mockResolvedValue(makeResp(503, { error: { code: 5000, message: 'busy' } }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.pushAll('T', 'C')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('http_503')
  })

  /* ============================================================================ */
  /* 8) fetch 抛错 → network_error                                                  */
  /* ============================================================================ */
  it('fetch 抛错 → ok=false + reason=network_error（不抛）', async () => {
    const provider = makeEnabledProvider()
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch

    const r = await provider.pushByAlias(['u'], 'T', 'C')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('network_error')
  })

  /* ============================================================================ */
  /* 9) 空目标参数 → 参数错误                                                       */
  /* ============================================================================ */
  it('空 rids / aliases / tags → 直接返回参数错误', async () => {
    const provider = makeEnabledProvider()
    /* fetch 不应被调用 */
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const r1 = await provider.pushByRegistrationId([], 'T', 'C')
    expect(r1.ok).toBe(false)
    expect(r1.reason).toBe('rids_empty')

    const r2 = await provider.pushByAlias([], 'T', 'C')
    expect(r2.ok).toBe(false)
    expect(r2.reason).toBe('aliases_empty')

    const r3 = await provider.pushByTag([], 'T', 'C')
    expect(r3.ok).toBe(false)
    expect(r3.reason).toBe('tags_empty')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 10) APNs 生产模式开关                                                          */
  /* ============================================================================ */
  it('JPUSH_APNS_PRODUCTION=true → options.apns_production=true', async () => {
    const provider = makeEnabledProvider({ JPUSH_APNS_PRODUCTION: 'true' })
    const fetchMock = jest.fn().mockResolvedValue(makeResp(200, { sendno: 'X', msg_id: 'Y' }))
    global.fetch = fetchMock as unknown as typeof fetch

    await provider.pushAll('T', 'C')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>
    const options = parsed.options as Record<string, unknown>
    expect(options.apns_production).toBe(true)
  })

  /* ============================================================================ */
  /* 11) 业务 error 字段（HTTP 200 但极光报错）                                      */
  /* ============================================================================ */
  it('200 但 body 含 error 字段 → ok=false + reason=jpush_<code>', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest
      .fn()
      .mockResolvedValue(makeResp(200, { error: { code: 1011, message: 'no available audience' } }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.pushByAlias(['x'], 'T', 'C')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('jpush_1011')
  })
})
