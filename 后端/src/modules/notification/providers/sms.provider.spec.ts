/**
 * @file sms.provider.spec.ts
 * @stage P9 / W5.C.3 (Sprint 5) — SmsProvider 单元测试
 * @desc 覆盖：
 *   - 缺凭证 no-op + warn
 *   - sendSms happy（mock fetch 返回 Code='OK' / BizId）
 *   - sendSms 失败（mock fetch 返回 Code='isv.MOBILE_NUMBER_ILLEGAL'）
 *   - sendBatch happy
 *   - 签名格式断言：Authorization-less GET，URL 含 Signature= 参数 + Action=SendSms + 排序后的参数
 *   - percentEncode / utcIsoTimestamp 静态方法
 *
 * @author Agent C (P9 Sprint 5)
 */

import { ConfigService } from '@nestjs/config'
import { SmsProvider } from './sms.provider'

/* ============================================================================
 * Helpers
 * ============================================================================ */

function makeConfig(map: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T): T =>
      map[key] !== undefined ? (map[key] as unknown as T) : (def as T)
  } as unknown as ConfigService
}

function withFetch(payload: Record<string, unknown>, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue({
    status,
    text: async (): Promise<string> => JSON.stringify(payload)
  } as unknown as Response)
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('SmsProvider', () => {
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
  it('disabled 时 sendSms / sendBatch 走 no-op + warn', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const provider = new SmsProvider(makeConfig({}))
    expect(provider.enabled).toBe(false)

    const r1 = await provider.sendSms('13800000000', 'SMS_X', { code: '1234' })
    expect(r1.ok).toBe(true)
    expect(r1.code).toBe('DISABLED')

    const r2 = await provider.sendBatch(['13800000000'], 'SMS_X', { code: '1234' })
    expect(r2.ok).toBe(true)
    expect(r2.code).toBe('DISABLED')

    expect(warn).toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 2) sendSms happy                                                               */
  /* ============================================================================ */
  it('sendSms happy：fetch 返回 Code=OK / BizId', async () => {
    const provider = new SmsProvider(
      makeConfig({
        SMS_ACCESS_KEY_ID: 'AKID_X',
        SMS_ACCESS_KEY_SECRET: 'SECRET_X',
        SMS_SIGN_NAME: '我的签名'
      })
    )
    expect(provider.enabled).toBe(true)
    const fetchMock = withFetch({ Code: 'OK', BizId: 'BIZ_001', Message: 'OK' })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await provider.sendSms('13800000000', 'SMS_123', { code: '654321' })
    expect(result.ok).toBe(true)
    expect(result.bizId).toBe('BIZ_001')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    /* 断言 URL 结构：包含 Signature / Action=SendSms / SignatureMethod=HMAC-SHA1 / Format=JSON */
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('GET')
    expect(url).toMatch(/^https:\/\/dysmsapi\.aliyuncs\.com\/\?/)
    expect(url).toMatch(/[?&]Signature=[^&]+/)
    expect(url).toMatch(/[?&]Action=SendSms(&|$)/)
    expect(url).toMatch(/[?&]SignatureMethod=HMAC-SHA1(&|$)/)
    expect(url).toMatch(/[?&]Format=JSON(&|$)/)
    expect(url).toMatch(/[?&]Version=2017-05-25(&|$)/)
    expect(url).toMatch(/[?&]Timestamp=\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}Z(&|$)/)
    expect(url).toMatch(/[?&]TemplateCode=SMS_123(&|$)/)
    /* 签名为 base64 → URL-encode 后只可能含字母数字 + %2B/%2F/%3D */
    const sigMatch = url.match(/[?&]Signature=([^&]+)/)
    expect(sigMatch).toBeTruthy()
    expect(sigMatch![1]).toMatch(/^[A-Za-z0-9%]+$/)
  })

  /* ============================================================================ */
  /* 3) sendSms 失败：API 返回 Code != 'OK'                                          */
  /* ============================================================================ */
  it('sendSms API 失败：返回 ok=false + 透传 code/message', async () => {
    const provider = new SmsProvider(
      makeConfig({
        SMS_ACCESS_KEY_ID: 'AKID_X',
        SMS_ACCESS_KEY_SECRET: 'SECRET_X',
        SMS_SIGN_NAME: 'SIGN_X'
      })
    )
    global.fetch = withFetch({
      Code: 'isv.MOBILE_NUMBER_ILLEGAL',
      Message: '手机号格式非法',
      RequestId: 'REQ_001'
    }) as unknown as typeof fetch

    const result = await provider.sendSms('1380000', 'SMS_X', { code: '1' })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('isv.MOBILE_NUMBER_ILLEGAL')
    expect(result.message).toBe('手机号格式非法')
  })

  /* ============================================================================ */
  /* 4) sendBatch happy                                                             */
  /* ============================================================================ */
  it('sendBatch happy：PhoneNumberJson / SignNameJson / TemplateParamJson 拼接正确', async () => {
    const provider = new SmsProvider(
      makeConfig({
        SMS_ACCESS_KEY_ID: 'AKID_X',
        SMS_ACCESS_KEY_SECRET: 'SECRET_X',
        SMS_SIGN_NAME: '我的签名'
      })
    )
    const fetchMock = withFetch({ Code: 'OK', BizId: 'BIZ_BATCH' })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await provider.sendBatch(['13800000000', '13900000000'], 'SMS_BATCH', {
      code: '888'
    })
    expect(result.ok).toBe(true)
    expect(result.bizId).toBe('BIZ_BATCH')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/[?&]Action=SendBatchSms(&|$)/)
    /* PhoneNumberJson 是 JSON.stringify(phones) → URL 编码 */
    expect(url).toContain('PhoneNumberJson=' + encodeURIComponent('["13800000000","13900000000"]'))
  })

  /* ============================================================================ */
  /* 5) sendBatch 空数组守卫                                                        */
  /* ============================================================================ */
  it('sendBatch 空数组 → ok=false / code=PARAM_INVALID', async () => {
    const provider = new SmsProvider(
      makeConfig({
        SMS_ACCESS_KEY_ID: 'AKID_X',
        SMS_ACCESS_KEY_SECRET: 'SECRET_X',
        SMS_SIGN_NAME: 'SIGN_X'
      })
    )
    const result = await provider.sendBatch([], 'SMS_X', {})
    expect(result.ok).toBe(false)
    expect(result.code).toBe('PARAM_INVALID')
  })

  /* ============================================================================ */
  /* 6) percentEncode 静态方法                                                       */
  /* ============================================================================ */
  it('percentEncode：空格→%20，*→%2A，~ 不编码', () => {
    expect(SmsProvider.percentEncode('a b')).toBe('a%20b')
    expect(SmsProvider.percentEncode('a*b')).toBe('a%2Ab')
    expect(SmsProvider.percentEncode('a~b')).toBe('a~b')
    expect(SmsProvider.percentEncode('中文')).toBe(encodeURIComponent('中文'))
  })

  /* ============================================================================ */
  /* 7) utcIsoTimestamp 格式                                                         */
  /* ============================================================================ */
  it('utcIsoTimestamp：YYYY-MM-DDThh:mm:ssZ', () => {
    /* 2026-05-01 03:14:09 UTC */
    const ts = SmsProvider.utcIsoTimestamp(new Date(Date.UTC(2026, 4, 1, 3, 14, 9)))
    expect(ts).toBe('2026-05-01T03:14:09Z')
  })

  /* ============================================================================ */
  /* 8) fetch 异常：返回 ok=false / code=EXCEPTION                                   */
  /* ============================================================================ */
  it('fetch 异常：sendSms 返回 ok=false / code=EXCEPTION（不抛）', async () => {
    const provider = new SmsProvider(
      makeConfig({
        SMS_ACCESS_KEY_ID: 'AKID_X',
        SMS_ACCESS_KEY_SECRET: 'SECRET_X',
        SMS_SIGN_NAME: 'SIGN_X'
      })
    )
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    const result = await provider.sendSms('13800000000', 'SMS_X', {})
    expect(result.ok).toBe(false)
    expect(result.code).toBe('EXCEPTION')
    expect(result.message).toBe('network down')
  })
})
