/**
 * @file notification.service.spec.ts
 * @stage P9/W5.B.1 (Sprint 5) — NotificationService 单元测试
 * @desc 覆盖：jpush 4 种 target 路由分发 / sms / wx-subscribe / axn 占位 provider 缺失分支
 *
 * @author Agent B (P9 Sprint 5)
 */

import { JPushProvider } from './providers/jpush.provider'
import {
  AXN_PROVIDER,
  IAxnProvider,
  ISmsProvider,
  IWxSubscribeProvider,
  NotificationService,
  SMS_PROVIDER,
  WX_SUBSCRIBE_PROVIDER
} from './notification.service'
import type { PushPayload, PushResult } from './notification.types'

/* ============================================================================
 * Helpers
 * ============================================================================ */

function makeJPushStub(): JPushProvider {
  return {
    pushByRegistrationId: jest.fn(async () => ({ ok: true, msgId: 'rid' })),
    pushByAlias: jest.fn(async () => ({ ok: true, msgId: 'alias' })),
    pushByTag: jest.fn(async () => ({ ok: true, msgId: 'tag' })),
    pushAll: jest.fn(async () => ({ ok: true, msgId: 'all' }))
  } as unknown as JPushProvider
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('NotificationService', () => {
  /* ============================================================================ */
  /* 1) jpush regId / alias / tag / all 4 种路由                                    */
  /* ============================================================================ */
  it('jpush regId → pushByRegistrationId', async () => {
    const jpush = makeJPushStub()
    const svc = new NotificationService(jpush)
    const payload: PushPayload = {
      channel: 'jpush',
      title: 'T',
      content: 'C',
      target: { kind: 'regId', values: ['RID-1'] }
    }
    const r = await svc.send(payload)
    expect(r.ok).toBe(true)
    expect(jpush.pushByRegistrationId).toHaveBeenCalledWith(['RID-1'], 'T', 'C', undefined)
  })

  it('jpush alias → pushByAlias', async () => {
    const jpush = makeJPushStub()
    const svc = new NotificationService(jpush)
    const r = await svc.send({
      channel: 'jpush',
      title: 'T',
      content: 'C',
      target: { kind: 'alias', values: ['user-1'] },
      extras: { orderNo: 'O1' }
    })
    expect(r.ok).toBe(true)
    expect(jpush.pushByAlias).toHaveBeenCalledWith(['user-1'], 'T', 'C', { orderNo: 'O1' })
  })

  it('jpush tag → pushByTag', async () => {
    const jpush = makeJPushStub()
    const svc = new NotificationService(jpush)
    const r = await svc.send({
      channel: 'jpush',
      title: 'T',
      content: 'C',
      target: { kind: 'tag', values: ['rider'] }
    })
    expect(r.ok).toBe(true)
    expect(jpush.pushByTag).toHaveBeenCalledWith(['rider'], 'T', 'C', undefined)
  })

  it('jpush all → pushAll', async () => {
    const jpush = makeJPushStub()
    const svc = new NotificationService(jpush)
    const r = await svc.send({
      channel: 'jpush',
      title: 'T',
      content: 'C',
      target: { kind: 'all' }
    })
    expect(r.ok).toBe(true)
    expect(jpush.pushAll).toHaveBeenCalledWith('T', 'C', undefined)
  })

  it('jpush 缺 target → reason=jpush_target_missing', async () => {
    const jpush = makeJPushStub()
    const svc = new NotificationService(jpush)
    const r = await svc.send({ channel: 'jpush', title: 'T', content: 'C' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('jpush_target_missing')
  })

  /* ============================================================================ */
  /* 2) sms / wx-subscribe / axn provider 缺失                                      */
  /* ============================================================================ */
  it('sms 无 provider → channel_provider_missing', async () => {
    const svc = new NotificationService(makeJPushStub())
    const r = await svc.send({
      channel: 'sms',
      title: 'T',
      content: 'C',
      phone: '13800000000',
      templateCode: 'SMS_TPL'
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('channel_provider_missing')
  })

  it('wx-subscribe 无 provider → channel_provider_missing', async () => {
    const svc = new NotificationService(makeJPushStub())
    const r = await svc.send({
      channel: 'wx-subscribe',
      title: 'T',
      content: 'C',
      openId: 'OPEN1',
      templateCode: 'TPL1'
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('channel_provider_missing')
  })

  it('axn 无 provider → channel_provider_missing', async () => {
    const svc = new NotificationService(makeJPushStub())
    const r = await svc.send({
      channel: 'axn',
      title: 'T',
      content: 'C',
      phone: '13800000000',
      phonePeer: '13900000000'
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('channel_provider_missing')
  })

  /* ============================================================================ */
  /* 3) sms / wx-subscribe / axn 注入 provider 时实际路由                           */
  /* ============================================================================ */
  it('sms 有 provider → 调用 send', async () => {
    const sms: ISmsProvider = {
      send: jest.fn(async (): Promise<PushResult> => ({ ok: true, msgId: 'BIZ1' }))
    }
    const svc = new NotificationService(makeJPushStub(), sms)
    const r = await svc.send({
      channel: 'sms',
      title: 'T',
      content: 'C',
      phone: '13800000000',
      templateCode: 'SMS_TPL',
      templateVars: { code: '1234' }
    })
    expect(r.ok).toBe(true)
    expect(sms.send).toHaveBeenCalledWith('13800000000', 'SMS_TPL', { code: '1234' })
  })

  it('sms 有 provider 但缺 phone/templateCode → sms_params_missing', async () => {
    const sms: ISmsProvider = { send: jest.fn() }
    const svc = new NotificationService(makeJPushStub(), sms)
    const r = await svc.send({ channel: 'sms', title: 'T', content: 'C' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('sms_params_missing')
    expect(sms.send).not.toHaveBeenCalled()
  })

  it('wx-subscribe 有 provider → 调用 send', async () => {
    const wx: IWxSubscribeProvider = {
      send: jest.fn(async (): Promise<PushResult> => ({ ok: true, msgId: 'WXMID' }))
    }
    const svc = new NotificationService(makeJPushStub(), undefined, wx)
    const r = await svc.send({
      channel: 'wx-subscribe',
      title: 'T',
      content: 'C',
      openId: 'OPEN1',
      templateCode: 'TPL1',
      templateVars: { thing1: 'X' }
    })
    expect(r.ok).toBe(true)
    expect(wx.send).toHaveBeenCalledWith('OPEN1', 'TPL1', { thing1: 'X' }, undefined)
  })

  it('axn 有 provider → 调用 bind', async () => {
    const axn: IAxnProvider = {
      bind: jest.fn(async (): Promise<PushResult> => ({ ok: true, msgId: 'AXNID' }))
    }
    const svc = new NotificationService(makeJPushStub(), undefined, undefined, axn)
    const r = await svc.send({
      channel: 'axn',
      title: 'T',
      content: 'C',
      phone: '13800000000',
      phonePeer: '13900000000'
    })
    expect(r.ok).toBe(true)
    expect(axn.bind).toHaveBeenCalledWith('13800000000', '13900000000', undefined)
  })

  /* ============================================================================ */
  /* 4) provider 抛错 → 不外抛，统一 reason=service_error                           */
  /* ============================================================================ */
  it('jpush provider 抛错 → reason=service_error', async () => {
    const jpush = {
      pushByAlias: jest.fn().mockRejectedValue(new Error('boom'))
    } as unknown as JPushProvider
    const svc = new NotificationService(jpush)
    const r = await svc.send({
      channel: 'jpush',
      title: 'T',
      content: 'C',
      target: { kind: 'alias', values: ['u'] }
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('service_error')
  })

  /* ============================================================================ */
  /* 5) 未知 channel                                                                */
  /* ============================================================================ */
  it('未知 channel → unknown_channel', async () => {
    const svc = new NotificationService(makeJPushStub())
    const r = await svc.send({
      channel: 'xxx' as 'jpush',
      title: 'T',
      content: 'C'
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('unknown_channel')
  })

  /* ============================================================================ */
  /* 6) 注入 token 常量存在性（避免误删）                                           */
  /* ============================================================================ */
  it('注入 token 常量已导出', () => {
    expect(SMS_PROVIDER).toBeDefined()
    expect(WX_SUBSCRIBE_PROVIDER).toBeDefined()
    expect(AXN_PROVIDER).toBeDefined()
  })
})
