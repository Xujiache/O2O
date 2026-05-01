/**
 * @file wx-subscribe.provider.spec.ts
 * @stage P9/W5.E.2 (Sprint 5) — WxSubscribeProvider 单元测试
 * @desc 覆盖：缺凭证 no-op / token 拉取 / token 缓存命中 / 发送 happy / 业务错误 / 模板别名 / 网络异常
 *
 * @author Agent E (P9 Sprint 5)
 */

import { ConfigService } from '@nestjs/config'
import { WxSubscribeProvider } from './wx-subscribe.provider'

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

function makeEnabledProvider(extra: Record<string, string> = {}): WxSubscribeProvider {
  return new WxSubscribeProvider(
    makeConfig({
      WX_APP_ID: 'wx_test_appid',
      WX_APP_SECRET: 'wx_test_secret',
      ...extra
    })
  )
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('WxSubscribeProvider', () => {
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
    const provider = new WxSubscribeProvider(makeConfig({}))
    expect(provider.enabled).toBe(false)

    const r = await provider.sendSubscribeMessage('OPENID', 'TPL', { name: { value: 'X' } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('disabled')

    expect(warn).toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 2) sendSubscribeMessage happy path：先 GET token，再 POST send                */
  /* ============================================================================ */
  it('happy path：先获取 access_token，再发送订阅消息；body 字段正确', async () => {
    const provider = makeEnabledProvider()
    expect(provider.enabled).toBe(true)

    const fetchMock = jest
      .fn()
      /* 第 1 次：token */
      .mockResolvedValueOnce(makeResp(200, { access_token: 'AT-XYZ', expires_in: 7200 }))
      /* 第 2 次：subscribe send */
      .mockResolvedValueOnce(makeResp(200, { errcode: 0, errmsg: 'ok' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.sendSubscribeMessage(
      'OPENID-1',
      'TEMPLATE-XYZ',
      { thing1: { value: '订单已接单' }, time2: { value: '2026-05-01 10:00' } },
      'pages/order/detail?orderNo=O123'
    )
    expect(r.ok).toBe(true)
    expect(r.errcode).toBe(0)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    /* 第 1 次：token URL */
    const tokenUrl = fetchMock.mock.calls[0][0] as string
    expect(tokenUrl).toContain('/cgi-bin/token')
    expect(tokenUrl).toContain('grant_type=client_credential')
    expect(tokenUrl).toContain('appid=wx_test_appid')
    expect(tokenUrl).toContain('secret=wx_test_secret')

    /* 第 2 次：发送 URL + body */
    const sendUrl = fetchMock.mock.calls[1][0] as string
    expect(sendUrl).toContain('/cgi-bin/message/subscribe/send')
    expect(sendUrl).toContain('access_token=AT-XYZ')

    const sendInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(sendInit.method).toBe('POST')
    const parsed = JSON.parse(sendInit.body as string) as Record<string, unknown>
    expect(parsed.touser).toBe('OPENID-1')
    expect(parsed.template_id).toBe('TEMPLATE-XYZ')
    expect(parsed.page).toBe('pages/order/detail?orderNo=O123')
    const data = parsed.data as Record<string, { value: string }>
    expect(data.thing1.value).toBe('订单已接单')
  })

  /* ============================================================================ */
  /* 3) token 缓存命中：第二次发送不再请求 token                                   */
  /* ============================================================================ */
  it('token 缓存命中：第二次 send 仅 1 次 fetch（send 自身）', async () => {
    const provider = makeEnabledProvider()

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResp(200, { access_token: 'AT1', expires_in: 7200 }))
      .mockResolvedValueOnce(makeResp(200, { errcode: 0, errmsg: 'ok' }))
      .mockResolvedValueOnce(makeResp(200, { errcode: 0, errmsg: 'ok' }))
    global.fetch = fetchMock as unknown as typeof fetch

    await provider.sendSubscribeMessage('O1', 'T1', { a: { value: '1' } })
    await provider.sendSubscribeMessage('O2', 'T1', { a: { value: '2' } })

    /* token 1 + send 2 = 3 次；如未缓存会 = 4 次 */
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  /* ============================================================================ */
  /* 4) 模板别名映射：env WX_SUBSCRIBE_TEMPLATES                                   */
  /* ============================================================================ */
  it('templateId 命中模板别名 → 实际发送替换为微信原始 ID', async () => {
    const provider = makeEnabledProvider({
      WX_SUBSCRIBE_TEMPLATES: JSON.stringify({ ORDER_PAID: 'TPL_REAL_AAA' })
    })

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResp(200, { access_token: 'AT', expires_in: 7200 }))
      .mockResolvedValueOnce(makeResp(200, { errcode: 0, errmsg: 'ok' }))
    global.fetch = fetchMock as unknown as typeof fetch

    await provider.sendSubscribeMessage('OPENID', 'ORDER_PAID', { a: { value: '1' } })

    const sendInit = fetchMock.mock.calls[1][1] as RequestInit
    const parsed = JSON.parse(sendInit.body as string) as Record<string, unknown>
    expect(parsed.template_id).toBe('TPL_REAL_AAA')
  })

  /* ============================================================================ */
  /* 5) 业务错误：errcode != 0 → 40001 自动清缓存                                  */
  /* ============================================================================ */
  it('errcode=40001 → ok=false + 自动清 token 缓存（下次重新拉）', async () => {
    const provider = makeEnabledProvider()

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResp(200, { access_token: 'AT-OLD', expires_in: 7200 }))
      .mockResolvedValueOnce(makeResp(200, { errcode: 40001, errmsg: 'invalid credential' }))
      /* 第二次发送时 token 缓存被清，重新拉 */
      .mockResolvedValueOnce(makeResp(200, { access_token: 'AT-NEW', expires_in: 7200 }))
      .mockResolvedValueOnce(makeResp(200, { errcode: 0, errmsg: 'ok' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r1 = await provider.sendSubscribeMessage('O', 'T', { a: { value: '1' } })
    expect(r1.ok).toBe(false)
    expect(r1.errcode).toBe(40001)
    expect(r1.reason).toBe('wx_40001')

    const r2 = await provider.sendSubscribeMessage('O', 'T', { a: { value: '2' } })
    expect(r2.ok).toBe(true)

    /* token 2 + send 2 = 4 次（第二次重新拉 token）*/
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  /* ============================================================================ */
  /* 6) 入参为空 → param_empty                                                      */
  /* ============================================================================ */
  it('openId 或 templateId 空 → 直接 param_empty（不发起 fetch）', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const r1 = await provider.sendSubscribeMessage('', 'T', { a: { value: '1' } })
    expect(r1.ok).toBe(false)
    expect(r1.reason).toBe('param_empty')

    const r2 = await provider.sendSubscribeMessage('O', '', { a: { value: '1' } })
    expect(r2.ok).toBe(false)
    expect(r2.reason).toBe('param_empty')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 7) token 拉取失败 → token_fetch_failed                                         */
  /* ============================================================================ */
  it('token 拉取失败（errcode 40013）→ ok=false + reason=token_fetch_failed', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResp(200, { errcode: 40013, errmsg: 'invalid appid' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.sendSubscribeMessage('O', 'T', { a: { value: '1' } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('token_fetch_failed')
  })

  /* ============================================================================ */
  /* 8) HTTP 5xx                                                                   */
  /* ============================================================================ */
  it('send HTTP 503 → ok=false + reason=http_503', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResp(200, { access_token: 'AT', expires_in: 7200 }))
      .mockResolvedValueOnce(makeResp(503, { errcode: -1, errmsg: 'busy' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.sendSubscribeMessage('O', 'T', { a: { value: '1' } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('http_503')
  })

  /* ============================================================================ */
  /* 9) network_error                                                               */
  /* ============================================================================ */
  it('fetch 抛错（token 阶段） → reason=token_fetch_failed', async () => {
    const provider = makeEnabledProvider()
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch

    const r = await provider.sendSubscribeMessage('O', 'T', { a: { value: '1' } })
    expect(r.ok).toBe(false)
    /* token 阶段 fetch 异常 → token 为空 → token_fetch_failed */
    expect(r.reason).toBe('token_fetch_failed')
  })

  it('fetch 抛错（send 阶段） → reason=network_error', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResp(200, { access_token: 'AT', expires_in: 7200 }))
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.sendSubscribeMessage('O', 'T', { a: { value: '1' } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('network_error')
  })

  /* ============================================================================ */
  /* 10) WX_SUBSCRIBE_TEMPLATES 非法 JSON                                           */
  /* ============================================================================ */
  it('WX_SUBSCRIBE_TEMPLATES 非 JSON → 模板 map 为空（不影响 send）', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const provider = makeEnabledProvider({ WX_SUBSCRIBE_TEMPLATES: 'not-json{{' })
    expect(provider.enabled).toBe(true)
    /* 构造时已 warn 一次 */
    expect(warn).toHaveBeenCalled()

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResp(200, { access_token: 'AT', expires_in: 7200 }))
      .mockResolvedValueOnce(makeResp(200, { errcode: 0, errmsg: 'ok' }))
    global.fetch = fetchMock as unknown as typeof fetch

    await provider.sendSubscribeMessage('O', 'TPL_RAW', { a: { value: '1' } })
    const sendInit = fetchMock.mock.calls[1][1] as RequestInit
    const parsed = JSON.parse(sendInit.body as string) as Record<string, unknown>
    /* 别名缺失 → 透传原 templateId */
    expect(parsed.template_id).toBe('TPL_RAW')
  })
})
