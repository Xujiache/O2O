/**
 * @file aliyun-axn.provider.spec.ts
 * @stage P9/W5.E.1 (Sprint 5) — AliyunAxnProvider 单元测试
 * @desc 覆盖：缺凭证 no-op / bindAxn happy / unbindAxn / queryCallDetail / 错误响应 / 网络异常 / 签名拼接
 *
 * 测试策略：
 *   - 全局 fetch mock：jest.fn() 替换；按场景配置不同响应
 *   - 用 ConfigService stub 注入凭证
 *
 * @author Agent E (P9 Sprint 5)
 */

import { ConfigService } from '@nestjs/config'
import { AliyunAxnProvider } from './aliyun-axn.provider'

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

function makeEnabledProvider(extra: Record<string, string> = {}): AliyunAxnProvider {
  return new AliyunAxnProvider(
    makeConfig({
      ALIYUN_AXN_ACCESS_KEY_ID: 'TEST_AK',
      ALIYUN_AXN_ACCESS_KEY_SECRET: 'TEST_SK',
      ALIYUN_AXN_POOL_KEY: 'FC100000000000000',
      ALIYUN_AXN_REGION: 'cn-hangzhou',
      ...extra
    })
  )
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('AliyunAxnProvider', () => {
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
    const provider = new AliyunAxnProvider(makeConfig({}))
    expect(provider.enabled).toBe(false)

    const r1 = await provider.bindAxn('13800000001', '13800000002')
    expect(r1.ok).toBe(false)
    expect(r1.reason).toBe('disabled')

    const r2 = await provider.unbindAxn('SUBS-1')
    expect(r2.ok).toBe(false)
    expect(r2.reason).toBe('disabled')

    const r3 = await provider.queryCallDetail('SUBS-1')
    expect(r3.ok).toBe(false)
    expect(r3.reason).toBe('disabled')

    expect(warn).toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 2) bindAxn happy path + URL / Action / 签名 校验                              */
  /* ============================================================================ */
  it('bindAxn 成功：返回 secretId + secretNo；URL 含 Action=BindAxn + Signature', async () => {
    const provider = makeEnabledProvider()
    expect(provider.enabled).toBe(true)

    const fetchMock = jest.fn().mockResolvedValue(
      makeResp(200, {
        Code: 'OK',
        Message: 'OK',
        SecretBindDTO: { SubsId: 'SUBS-100', SecretNo: '17012345678' }
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.bindAxn('13811111111', '13822222222', 60)
    expect(r.ok).toBe(true)
    expect(r.secretId).toBe('SUBS-100')
    expect(r.secretNo).toBe('17012345678')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url.startsWith('https://dyplsapi.aliyuncs.com/?')).toBe(true)
    expect(url).toContain('Action=BindAxn')
    expect(url).toContain('PoolKey=FC100000000000000')
    expect(url).toContain('PhoneNoA=13811111111')
    expect(url).toContain('PhoneNoB=13822222222')
    expect(url).toContain('Signature=')
    expect(url).toContain('SignatureMethod=HMAC-SHA1')
    expect(url).toContain('SignatureVersion=1.0')
    expect(url).toContain('Version=2017-05-25')
    expect(url).toContain('AccessKeyId=TEST_AK')
    expect(init.method).toBe('GET')
  })

  /* ============================================================================ */
  /* 3) bindAxn 阿里云业务错误 Code != OK                                           */
  /* ============================================================================ */
  it('bindAxn 阿里云 Code != OK → ok=false + reason=aliyun_<code>', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        makeResp(200, { Code: 'isv.NO_AVAILABLE_NUMBER', Message: '号池无可用号码' })
      )
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.bindAxn('13811111111', '13822222222')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('aliyun_isv.NO_AVAILABLE_NUMBER')
  })

  /* ============================================================================ */
  /* 4) bindAxn 入参校验：phoneA / phoneB 空                                        */
  /* ============================================================================ */
  it('bindAxn phoneA / phoneB 空 → 直接返回 phone_empty（不发起 fetch）', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const r1 = await provider.bindAxn('', '13822222222')
    expect(r1.ok).toBe(false)
    expect(r1.reason).toBe('phone_empty')

    const r2 = await provider.bindAxn('13811111111', '')
    expect(r2.ok).toBe(false)
    expect(r2.reason).toBe('phone_empty')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 5) unbindAxn happy                                                             */
  /* ============================================================================ */
  it('unbindAxn 成功：URL Action=UnbindSubscription，返回 ok', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(makeResp(200, { Code: 'OK', Message: 'OK' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.unbindAxn('SUBS-100')
    expect(r.ok).toBe(true)

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('Action=UnbindSubscription')
    expect(url).toContain('SubsId=SUBS-100')
  })

  /* ============================================================================ */
  /* 6) unbindAxn 入参为空                                                          */
  /* ============================================================================ */
  it('unbindAxn secretId 空 → reason=secret_id_empty', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.unbindAxn('')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('secret_id_empty')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 7) queryCallDetail happy                                                       */
  /* ============================================================================ */
  it('queryCallDetail 成功：返回 records[0] 透传', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(
      makeResp(200, {
        Code: 'OK',
        Message: 'OK',
        SecretCallStatusDTO: { CallId: 'C-1', Status: 'IDLE', Duration: 30 }
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.queryCallDetail('SUBS-100')
    expect(r.ok).toBe(true)
    expect(r.total).toBe(1)
    expect(r.records?.[0]).toMatchObject({ CallId: 'C-1', Status: 'IDLE' })

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('Action=QueryCallStatus')
  })

  /* ============================================================================ */
  /* 8) HTTP 5xx                                                                   */
  /* ============================================================================ */
  it('HTTP 503 → ok=false + reason=http_503', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(makeResp(503, { Code: 'ServiceUnavailable' }))
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.bindAxn('13811111111', '13822222222')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('http_503')
  })

  /* ============================================================================ */
  /* 9) fetch 抛错 → network_error                                                  */
  /* ============================================================================ */
  it('fetch 抛错 → ok=false + reason=network_error（不抛）', async () => {
    const provider = makeEnabledProvider()
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch

    const r = await provider.bindAxn('13811111111', '13822222222')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('network_error')
  })

  /* ============================================================================ */
  /* 10) bindAxn 返回缺 secretNo                                                    */
  /* ============================================================================ */
  it('bindAxn 返回缺 SecretNo → reason=no_secret_in_resp', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        makeResp(200, { Code: 'OK', Message: 'OK', SecretBindDTO: { SubsId: 'SUBS-1' } })
      )
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.bindAxn('13811111111', '13822222222')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('no_secret_in_resp')
  })

  /* ============================================================================ */
  /* 11) 签名稳定性：相同 nonce 时签名应一致（这里只断言 Signature 非空 & url-encoded） */
  /* ============================================================================ */
  it('Signature 字段非空且经过 percentEncode（不含 +/= 之类未转义符）', async () => {
    const provider = makeEnabledProvider()
    const fetchMock = jest.fn().mockResolvedValue(
      makeResp(200, {
        Code: 'OK',
        SecretBindDTO: { SubsId: 'S', SecretNo: 'X' }
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    await provider.bindAxn('13811111111', '13822222222')
    const url = fetchMock.mock.calls[0][0] as string
    const m = url.match(/Signature=([^&]+)/)
    expect(m).not.toBeNull()
    const sig = m![1]
    expect(sig.length).toBeGreaterThan(0)
    /* + / = 等需要转义 */
    expect(sig).not.toMatch(/[+=]/)
  })
})
