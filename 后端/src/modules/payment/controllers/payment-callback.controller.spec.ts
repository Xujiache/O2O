/**
 * @file payment-callback.controller.spec.ts
 * @stage P9/W3.C.3 (Sprint 3) — PaymentCallbackController 单元测试
 * @desc 用 mock provider + mock state machine 验证：
 *         - 微信验签失败 → FAIL
 *         - 微信验签通过 → state machine 推进 → SUCCESS
 *         - 支付宝验签失败 → 'fail'
 *         - 支付宝验签通过且 TRADE_SUCCESS → state machine 推进 → 'success'
 *         - 支付宝验签通过但 WAIT_BUYER_PAY → 'success' 但不推进
 *
 * @author Agent C (P9 Sprint 3)
 */

import type { Request } from 'express'
import { PaymentCallbackController } from './payment-callback.controller'
import type { AlipayProvider, WechatPayV3Provider } from '../providers'
import type { PaymentStateMachine } from '../services/payment-state-machine'

interface ProviderMocks {
  wechat: { verifyCallback: jest.Mock }
  alipay: { verifyAsyncNotify: jest.Mock }
  state: { transit: jest.Mock }
}

function build(): {
  controller: PaymentCallbackController
  mocks: ProviderMocks
} {
  const wechat = { verifyCallback: jest.fn() }
  const alipay = { verifyAsyncNotify: jest.fn() }
  const state = {
    transit: jest.fn().mockResolvedValue({ from: 1, to: 2, idempotent: false, payNo: 'O1' })
  }
  const controller = new PaymentCallbackController(
    wechat as unknown as WechatPayV3Provider,
    alipay as unknown as AlipayProvider,
    state as unknown as PaymentStateMachine
  )
  return { controller, mocks: { wechat, alipay, state } }
}

/** 构造一个最简 Request，可携带 rawBody */
function makeReq(rawBody?: string): Request {
  const req: Partial<Request> & { rawBody?: Buffer } = {}
  if (rawBody !== undefined) req.rawBody = Buffer.from(rawBody, 'utf8')
  return req as Request
}

describe('PaymentCallbackController', () => {
  /* ============================================================================ */
  /* 微信                                                                            */
  /* ============================================================================ */
  it('wechat 验签失败 → FAIL', async () => {
    const { controller, mocks } = build()
    mocks.wechat.verifyCallback.mockResolvedValue({ valid: false, reason: 'sig 错' })
    const r = await controller.wechat(
      {
        'wechatpay-timestamp': '123',
        'wechatpay-nonce': 'n',
        'wechatpay-signature': 's',
        'wechatpay-serial': 'sn'
      },
      { foo: 'bar' },
      makeReq('{"foo":"bar"}')
    )
    expect(r.code).toBe('FAIL')
    expect(mocks.state.transit).not.toHaveBeenCalled()
  })

  it('wechat 验签通过 → 推进 state machine + SUCCESS', async () => {
    const { controller, mocks } = build()
    mocks.wechat.verifyCallback.mockResolvedValue({
      valid: true,
      resource: {
        orderNo: 'O1',
        transactionId: 'TX-1',
        payerOpenId: 'OP1',
        amount: 1500,
        raw: { x: 1 }
      }
    })
    const r = await controller.wechat(
      {
        'wechatpay-timestamp': '123',
        'wechatpay-nonce': 'n',
        'wechatpay-signature': 's',
        'wechatpay-serial': 'sn'
      },
      { foo: 'bar' },
      makeReq('{"foo":"bar"}')
    )
    expect(r.code).toBe('SUCCESS')
    expect(mocks.state.transit).toHaveBeenCalledWith(
      'O1',
      'PaymentSucceed',
      expect.objectContaining({ outTradeNo: 'TX-1' })
    )
  })

  it('wechat raw body 缺失时退化使用 JSON.stringify 兜底', async () => {
    const { controller, mocks } = build()
    mocks.wechat.verifyCallback.mockResolvedValue({ valid: false, reason: 'sig 错' })
    /* 不带 rawBody */
    await controller.wechat(
      {
        'wechatpay-timestamp': '1',
        'wechatpay-nonce': 'n',
        'wechatpay-signature': 's',
        'wechatpay-serial': 'sn'
      },
      { hello: 'world' },
      makeReq()
    )
    /* 验签函数被传入 JSON.stringify 后的字符串 */
    const passed = (mocks.wechat.verifyCallback.mock.calls[0] as unknown[])[1]
    expect(typeof passed).toBe('string')
    expect(passed).toBe(JSON.stringify({ hello: 'world' }))
  })

  /* ============================================================================ */
  /* 支付宝                                                                          */
  /* ============================================================================ */
  it('alipay 验签失败 → fail', async () => {
    const { controller, mocks } = build()
    mocks.alipay.verifyAsyncNotify.mockResolvedValue({ valid: false, reason: 'bad sig' })
    const r = await controller.alipay({
      out_trade_no: 'O1',
      sign: 'x'
    })
    expect(r).toBe('fail')
    expect(mocks.state.transit).not.toHaveBeenCalled()
  })

  it('alipay 验签通过 + TRADE_SUCCESS → 推进 + success', async () => {
    const { controller, mocks } = build()
    mocks.alipay.verifyAsyncNotify.mockResolvedValue({
      valid: true,
      orderNo: 'O1',
      tradeNo: 'TX-A',
      totalAmount: '99.00',
      tradeStatus: 'TRADE_SUCCESS'
    })
    const r = await controller.alipay({
      out_trade_no: 'O1',
      trade_no: 'TX-A',
      total_amount: '99.00',
      trade_status: 'TRADE_SUCCESS',
      sign: 'x',
      sign_type: 'RSA2'
    })
    expect(r).toBe('success')
    expect(mocks.state.transit).toHaveBeenCalledWith(
      'O1',
      'PaymentSucceed',
      expect.objectContaining({ outTradeNo: 'TX-A' })
    )
  })

  it('alipay 验签通过 + WAIT_BUYER_PAY → success 但不推进', async () => {
    const { controller, mocks } = build()
    mocks.alipay.verifyAsyncNotify.mockResolvedValue({
      valid: true,
      orderNo: 'O1',
      tradeNo: '',
      totalAmount: '99.00',
      tradeStatus: 'WAIT_BUYER_PAY'
    })
    const r = await controller.alipay({
      out_trade_no: 'O1',
      trade_status: 'WAIT_BUYER_PAY',
      sign: 'x',
      sign_type: 'RSA2'
    })
    expect(r).toBe('success')
    expect(mocks.state.transit).not.toHaveBeenCalled()
  })
})
