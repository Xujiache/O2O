/**
 * @file alipay.provider.spec.ts
 * @stage P9/W3.C.2 (Sprint 3) — AlipayProvider 单元测试
 * @desc 覆盖：缺凭证 no-op / pagePay 同步生成 form / verifyAsyncNotify 正反 / queryOrder / refund
 *
 * @author Agent C (P9 Sprint 3)
 */

import { generateKeyPairSync, createSign } from 'crypto'
import { ConfigService } from '@nestjs/config'
import { AlipayProvider } from './alipay.provider'

interface KeyPairPem {
  privatePem: string
  publicPem: string
}

function genRsaKeyPair(): KeyPairPem {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  return { privatePem: privateKey, publicPem: publicKey }
}

function makeConfig(map: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T): T =>
      map[key] !== undefined ? (map[key] as unknown as T) : (def as T)
  } as unknown as ConfigService
}

/** 用支付宝私钥（同 provider 私钥）签 ASCII 升序拼接的内容 */
function rsa2Sign(content: string, privatePem: string): string {
  const signer = createSign('RSA-SHA256')
  signer.update(content, 'utf8')
  signer.end()
  return signer.sign(privatePem, 'base64')
}

describe('AlipayProvider', () => {
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
  /* 1) disabled 缺凭证                                                              */
  /* ============================================================================ */
  it('disabled 时所有方法走 no-op + console.warn', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const provider = new AlipayProvider(makeConfig({}))
    expect(provider.enabled).toBe(false)

    const r1 = provider.pagePay('O1', '1.00', 'subj')
    expect(r1.formHtml).toBe('')
    expect(r1.payUrl).toBe('')

    const r2 = await provider.verifyAsyncNotify({ out_trade_no: 'O1', sign: 'x' })
    expect(r2.valid).toBe(false)

    const r3 = await provider.queryOrder('O1')
    expect(r3.tradeStatus).toBe('WAIT_BUYER_PAY')

    const r4 = await provider.refund('R1', 'O1', '1.00')
    expect(r4.tradeNo).toBe('')

    expect(warn).toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 2) pagePay happy path                                                          */
  /* ============================================================================ */
  it('pagePay 同步生成 form + URL，含 sign 参数', () => {
    const { privatePem, publicPem } = genRsaKeyPair()
    const provider = new AlipayProvider(
      makeConfig({
        ALIPAY_APP_ID: 'APP1',
        ALIPAY_PRIVATE_KEY: privatePem,
        ALIPAY_PUBLIC_KEY: publicPem,
        ALIPAY_NOTIFY_URL: 'https://example.com/notify',
        ALIPAY_RETURN_URL: 'https://example.com/return',
        ALIPAY_GATEWAY: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
      })
    )
    expect(provider.enabled).toBe(true)
    const r = provider.pagePay('ORDER01', '99.00', '商品 X')
    expect(r.payUrl).toContain('https://openapi-sandbox.dl.alipaydev.com/gateway.do?')
    expect(r.payUrl).toContain('app_id=APP1')
    expect(r.payUrl).toContain('method=alipay.trade.page.pay')
    expect(r.payUrl).toContain('sign=')
    expect(r.formHtml).toContain('<form')
    expect(r.formHtml).toContain('name="sign"')
    expect(r.formHtml).toContain('name="biz_content"')
  })

  /* ============================================================================ */
  /* 3) verifyAsyncNotify 签名错误 → valid=false                                    */
  /* ============================================================================ */
  it('verifyAsyncNotify 签名错误返回 valid=false', async () => {
    const { privatePem, publicPem } = genRsaKeyPair()
    const provider = new AlipayProvider(
      makeConfig({
        ALIPAY_APP_ID: 'APP1',
        ALIPAY_PRIVATE_KEY: privatePem,
        ALIPAY_PUBLIC_KEY: publicPem,
        ALIPAY_NOTIFY_URL: 'https://example.com/notify',
        ALIPAY_RETURN_URL: 'https://example.com/return'
      })
    )
    const r = await provider.verifyAsyncNotify({
      out_trade_no: 'O1',
      trade_no: 'TX1',
      total_amount: '1.00',
      trade_status: 'TRADE_SUCCESS',
      sign_type: 'RSA2',
      sign: Buffer.from('garbage').toString('base64')
    })
    expect(r.valid).toBe(false)
    expect(r.reason).toBeDefined()
  })

  /* ============================================================================ */
  /* 4) verifyAsyncNotify 签名正确 → valid=true                                     */
  /* ============================================================================ */
  it('verifyAsyncNotify 签名正确返回 valid=true', async () => {
    /* 平台密钥对：用私钥签名（充当支付宝平台），用公钥配置进 provider 验签 */
    const { privatePem, publicPem } = genRsaKeyPair()
    const provider = new AlipayProvider(
      makeConfig({
        ALIPAY_APP_ID: 'APP1',
        ALIPAY_PRIVATE_KEY: privatePem,
        ALIPAY_PUBLIC_KEY: publicPem,
        ALIPAY_NOTIFY_URL: 'https://example.com/notify',
        ALIPAY_RETURN_URL: 'https://example.com/return'
      })
    )

    const params: Record<string, string> = {
      app_id: 'APP1',
      out_trade_no: 'ORDER01',
      trade_no: 'TX-AAA',
      total_amount: '99.00',
      trade_status: 'TRADE_SUCCESS',
      gmt_payment: '2026-05-01 12:00:00',
      notify_id: 'NID-1',
      notify_type: 'trade_status_sync'
    }
    /* 按 ASCII key 升序拼接 */
    const keys = Object.keys(params).sort()
    const content = keys.map((k) => `${k}=${params[k]}`).join('&')
    const sign = rsa2Sign(content, privatePem)

    const r = await provider.verifyAsyncNotify({ ...params, sign_type: 'RSA2', sign })
    expect(r.valid).toBe(true)
    expect(r.orderNo).toBe('ORDER01')
    expect(r.tradeNo).toBe('TX-AAA')
    expect(r.totalAmount).toBe('99.00')
    expect(r.tradeStatus).toBe('TRADE_SUCCESS')
  })

  /* ============================================================================ */
  /* 5) queryOrder happy                                                            */
  /* ============================================================================ */
  it('queryOrder 调用 fetch 并解析 trade_status', async () => {
    const { privatePem, publicPem } = genRsaKeyPair()
    const provider = new AlipayProvider(
      makeConfig({
        ALIPAY_APP_ID: 'APP1',
        ALIPAY_PRIVATE_KEY: privatePem,
        ALIPAY_PUBLIC_KEY: publicPem,
        ALIPAY_NOTIFY_URL: 'https://example.com/notify',
        ALIPAY_RETURN_URL: 'https://example.com/return'
      })
    )
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: async (): Promise<string> =>
        JSON.stringify({
          alipay_trade_query_response: {
            code: '10000',
            trade_status: 'TRADE_SUCCESS',
            trade_no: 'TX-AAA'
          }
        })
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.queryOrder('ORDER01')
    expect(r.tradeStatus).toBe('TRADE_SUCCESS')
    expect(r.tradeNo).toBe('TX-AAA')
  })

  /* ============================================================================ */
  /* 6) refund happy                                                                */
  /* ============================================================================ */
  it('refund 调用 fetch 并解析 refund_fee', async () => {
    const { privatePem, publicPem } = genRsaKeyPair()
    const provider = new AlipayProvider(
      makeConfig({
        ALIPAY_APP_ID: 'APP1',
        ALIPAY_PRIVATE_KEY: privatePem,
        ALIPAY_PUBLIC_KEY: publicPem,
        ALIPAY_NOTIFY_URL: 'https://example.com/notify',
        ALIPAY_RETURN_URL: 'https://example.com/return'
      })
    )
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: async (): Promise<string> =>
        JSON.stringify({
          alipay_trade_refund_response: {
            code: '10000',
            trade_no: 'TX-AAA',
            refund_fee: '5.00',
            fund_change: 'Y'
          }
        })
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.refund('REFUND01', 'ORDER01', '5.00')
    expect(r.tradeNo).toBe('TX-AAA')
    expect(r.refundFee).toBe('5.00')
  })
})
