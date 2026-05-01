/**
 * @file wechat-pay-v3.provider.spec.ts
 * @stage P9/W3.C.1 (Sprint 3) — WechatPayV3Provider 单元测试
 * @desc 覆盖：缺凭证 no-op / jsapiPay happy / verifyCallback 正反 / queryOrder / refund
 *
 * 测试策略：
 *   - 用 generateKeyPairSync 生成 RSA-2048 密钥对，分别充当"商户私钥"和"平台公钥"
 *   - 全局 fetch mock：jest.fn() 替换；每个 test 配置不同响应
 *   - AES-256-GCM 加密：用 provider.encryptResourceForTest 反向构造合法回调密文
 *
 * @author Agent C (P9 Sprint 3)
 */

import { generateKeyPairSync, createSign } from 'crypto'
import { ConfigService } from '@nestjs/config'
import { WechatPayV3Provider } from './wechat-pay-v3.provider'

/* ============================================================================
 * Helpers
 * ============================================================================ */

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

/** 构造一个 ConfigService stub */
function makeConfig(map: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, def?: T): T =>
      map[key] !== undefined ? (map[key] as unknown as T) : (def as T)
  } as unknown as ConfigService
}

/** 给一段 body 用商户私钥（这里假装平台私钥）做 RSA-SHA256 base64 签名 */
function rsaSign(body: string, privatePem: string): string {
  const signer = createSign('RSA-SHA256')
  signer.update(body, 'utf8')
  signer.end()
  return signer.sign(privatePem, 'base64')
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('WechatPayV3Provider', () => {
  /* 保存 / 还原 fetch */
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
    const provider = new WechatPayV3Provider(makeConfig({}))
    expect(provider.enabled).toBe(false)

    const r1 = await provider.jsapiPay('O1', 100, 'OPENID', 'desc')
    expect(r1.prepayId).toBe('')
    expect(r1.paySign.paySign).toBe('')

    const r2 = await provider.verifyCallback(
      {
        'wechatpay-timestamp': '1',
        'wechatpay-nonce': 'n',
        'wechatpay-signature': 's',
        'wechatpay-serial': 'sn'
      },
      '{}'
    )
    expect(r2.valid).toBe(false)

    const r3 = await provider.queryOrder('O1')
    expect(r3.status).toBe('NOTPAY')

    const r4 = await provider.refund('R1', 'O1', 1, 1)
    expect(r4.refundId).toBe('')

    /* 至少一次 disabled warn（构造时已打印） */
    expect(warn).toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 2) jsapiPay happy path                                                         */
  /* ============================================================================ */
  it('jsapiPay 成功：mock fetch 返回 prepay_id，签名结构正确', async () => {
    const { privatePem } = genRsaKeyPair()
    const provider = new WechatPayV3Provider(
      makeConfig({
        WECHAT_PAY_V3_MCHID: '1900000001',
        WECHAT_PAY_V3_APPID: 'wxapp1',
        WECHAT_PAY_V3_SERIAL_NO: 'SERIAL1',
        WECHAT_PAY_V3_API_V3_KEY: '12345678901234567890123456789012',
        WECHAT_PAY_V3_PRIVATE_KEY: privatePem,
        WECHAT_PAY_V3_NOTIFY_URL: 'https://example.com/notify',
        WECHAT_PAY_V3_SANDBOX_BASE_URL: 'https://api.mch.weixin.qq.com'
      })
    )
    expect(provider.enabled).toBe(true)

    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: async (): Promise<string> => JSON.stringify({ prepay_id: 'wx-prepay-xyz' })
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await provider.jsapiPay('ORDER001', 1500, 'OPENID-AAA', '商品 X')
    expect(result.prepayId).toBe('wx-prepay-xyz')
    expect(result.paySign.appId).toBe('wxapp1')
    expect(result.paySign.signType).toBe('RSA')
    expect(result.paySign.package).toBe('prepay_id=wx-prepay-xyz')
    expect(result.paySign.paySign).toMatch(/^[A-Za-z0-9+/=]+$/)

    /* fetch 被以正确的 URL + Authorization 调用 */
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^WECHATPAY2-SHA256-RSA2048 mchid=/)
    expect(headers.Authorization).toContain('serial_no="SERIAL1"')
  })

  /* ============================================================================ */
  /* 3) verifyCallback 签名错误返回 valid=false                                     */
  /* ============================================================================ */
  it('verifyCallback 签名错误 → valid=false', async () => {
    const { privatePem, publicPem } = genRsaKeyPair()
    const provider = new WechatPayV3Provider(
      makeConfig({
        WECHAT_PAY_V3_MCHID: '1900000001',
        WECHAT_PAY_V3_APPID: 'wxapp1',
        WECHAT_PAY_V3_SERIAL_NO: 'SERIAL1',
        WECHAT_PAY_V3_API_V3_KEY: '12345678901234567890123456789012',
        WECHAT_PAY_V3_PRIVATE_KEY: privatePem,
        WECHAT_PAY_V3_PLATFORM_PUBLIC_KEY: publicPem,
        WECHAT_PAY_V3_NOTIFY_URL: 'https://example.com/notify'
      })
    )
    const ts = Math.floor(Date.now() / 1000).toString()
    const result = await provider.verifyCallback(
      {
        'wechatpay-timestamp': ts,
        'wechatpay-nonce': 'NONCE1',
        /* 故意填一个无效签名 */
        'wechatpay-signature': Buffer.from('garbage').toString('base64'),
        'wechatpay-serial': 'PLATFORM1'
      },
      '{}'
    )
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })

  /* ============================================================================ */
  /* 4) verifyCallback 签名正确 + AES-GCM 解密                                      */
  /* ============================================================================ */
  it('verifyCallback 签名正确 + 解密 resource 成功', async () => {
    const platformKey = genRsaKeyPair() /* 充当微信平台密钥对 */
    const merchantKey = genRsaKeyPair() /* 商户密钥对（本测试不实际使用，但 provider 要求齐全） */
    const provider = new WechatPayV3Provider(
      makeConfig({
        WECHAT_PAY_V3_MCHID: '1900000001',
        WECHAT_PAY_V3_APPID: 'wxapp1',
        WECHAT_PAY_V3_SERIAL_NO: 'SERIAL1',
        WECHAT_PAY_V3_API_V3_KEY: '12345678901234567890123456789012',
        WECHAT_PAY_V3_PRIVATE_KEY: merchantKey.privatePem,
        WECHAT_PAY_V3_PLATFORM_PUBLIC_KEY: platformKey.publicPem,
        WECHAT_PAY_V3_NOTIFY_URL: 'https://example.com/notify'
      })
    )

    /* 构造合法回调 body：resource 用 provider.encryptResourceForTest 加密 */
    const innerPlain = JSON.stringify({
      out_trade_no: 'ORDER001',
      transaction_id: 'WX-TX-123',
      payer: { openid: 'OPEN-USER' },
      amount: { payer_total: 1500, total: 1500 }
    })
    const nonce12 = '12345678ABCD' /* 12 字节 */
    const aad = 'transaction'
    const ciphertext = provider.encryptResourceForTest(innerPlain, nonce12, aad)
    const body = JSON.stringify({
      id: 'EVT-1',
      event_type: 'TRANSACTION.SUCCESS',
      resource_type: 'encrypt-resource',
      resource: {
        algorithm: 'AEAD_AES_256_GCM',
        ciphertext,
        nonce: nonce12,
        associated_data: aad
      }
    })

    const ts = Math.floor(Date.now() / 1000).toString()
    const nonceHdr = 'NONCE-HDR'
    const signaturePayload = `${ts}\n${nonceHdr}\n${body}\n`
    const signature = rsaSign(signaturePayload, platformKey.privatePem)

    const result = await provider.verifyCallback(
      {
        'wechatpay-timestamp': ts,
        'wechatpay-nonce': nonceHdr,
        'wechatpay-signature': signature,
        'wechatpay-serial': 'PLATFORM1'
      },
      body
    )
    expect(result.valid).toBe(true)
    expect(result.resource).toBeDefined()
    expect(result.resource?.orderNo).toBe('ORDER001')
    expect(result.resource?.transactionId).toBe('WX-TX-123')
    expect(result.resource?.payerOpenId).toBe('OPEN-USER')
    expect(result.resource?.amount).toBe(1500)
  })

  /* ============================================================================ */
  /* 5) queryOrder happy path                                                       */
  /* ============================================================================ */
  it('queryOrder 返回 SUCCESS', async () => {
    const { privatePem } = genRsaKeyPair()
    const provider = new WechatPayV3Provider(
      makeConfig({
        WECHAT_PAY_V3_MCHID: '1900000001',
        WECHAT_PAY_V3_APPID: 'wxapp1',
        WECHAT_PAY_V3_SERIAL_NO: 'SERIAL1',
        WECHAT_PAY_V3_API_V3_KEY: '12345678901234567890123456789012',
        WECHAT_PAY_V3_PRIVATE_KEY: privatePem,
        WECHAT_PAY_V3_NOTIFY_URL: 'https://example.com/notify'
      })
    )
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: async (): Promise<string> =>
        JSON.stringify({ trade_state: 'SUCCESS', transaction_id: 'WX-TX-1' })
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.queryOrder('ORDER001')
    expect(r.status).toBe('SUCCESS')
    expect(r.transactionId).toBe('WX-TX-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v3/pay/transactions/out-trade-no/ORDER001')
    expect(init.method).toBe('GET')
  })

  /* ============================================================================ */
  /* 6) refund happy path                                                           */
  /* ============================================================================ */
  it('refund 成功返回 refund_id + status', async () => {
    const { privatePem } = genRsaKeyPair()
    const provider = new WechatPayV3Provider(
      makeConfig({
        WECHAT_PAY_V3_MCHID: '1900000001',
        WECHAT_PAY_V3_APPID: 'wxapp1',
        WECHAT_PAY_V3_SERIAL_NO: 'SERIAL1',
        WECHAT_PAY_V3_API_V3_KEY: '12345678901234567890123456789012',
        WECHAT_PAY_V3_PRIVATE_KEY: privatePem,
        WECHAT_PAY_V3_NOTIFY_URL: 'https://example.com/notify'
      })
    )
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: async (): Promise<string> =>
        JSON.stringify({ refund_id: 'WX-RF-1', status: 'PROCESSING' })
    } as unknown as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const r = await provider.refund('REFUND001', 'ORDER001', 500, 1500)
    expect(r.refundId).toBe('WX-RF-1')
    expect(r.status).toBe('PROCESSING')
  })
})
