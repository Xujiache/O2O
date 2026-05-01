/**
 * @file push-token.controller.spec.ts
 * @stage P9 Sprint 5 / W5.E.3
 * @desc PushTokenController 单元测试：register / unregister / heartbeat
 *
 * 测试策略：
 *   - mock PushTokenService；构造 AuthUser 直接调用 controller 方法
 *   - 不启动 NestApplication
 *
 * @author Agent E (P9 Sprint 5)
 */

import { PushTokenController, PushRegisterDto } from './push-token.controller'
import type { PushTokenService } from '../services/push-token.service'
import type { AuthUser } from '@/modules/auth/decorators'

/* ============================================================================
 * Helpers
 * ============================================================================ */

function makeUser(uid: string, userType: AuthUser['userType']): AuthUser {
  return { uid, userType, tenantId: 0, ver: 1 }
}

function makeService(): {
  service: PushTokenService
  register: jest.Mock
  unregister: jest.Mock
  heartbeat: jest.Mock
} {
  const register = jest.fn().mockResolvedValue({ ok: true, id: 'new-id', message: 'created' })
  const unregister = jest.fn().mockResolvedValue({ ok: true, message: 'affected_1' })
  const heartbeat = jest.fn().mockResolvedValue({ ok: true, message: 'affected_1' })
  const service = { register, unregister, heartbeat } as unknown as PushTokenService
  return { service, register, unregister, heartbeat }
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('PushTokenController', () => {
  /* ============================================================================ */
  /* 1) register：userType 字符串 → 数值映射                                       */
  /* ============================================================================ */
  it('register：user → userType=1 转换并透传 service', async () => {
    const { service, register } = makeService()
    const ctrl = new PushTokenController(service)

    const dto: PushRegisterDto = {
      platform: 'ios',
      registrationId: 'RID-AAA',
      deviceId: 'd-1',
      appVersion: '1.0.0'
    }
    const r = await ctrl.register(dto, makeUser('u-1', 'user'))
    expect(r.ok).toBe(true)
    expect(register).toHaveBeenCalledWith({
      userId: 'u-1',
      userType: 1,
      platform: 'ios',
      registrationId: 'RID-AAA',
      deviceId: 'd-1',
      appVersion: '1.0.0'
    })
  })

  it('register：merchant → userType=2', async () => {
    const { service, register } = makeService()
    const ctrl = new PushTokenController(service)
    const dto: PushRegisterDto = { platform: 'android', registrationId: 'X' }
    await ctrl.register(dto, makeUser('m-1', 'merchant'))
    const arg = register.mock.calls[0][0] as { userType: number }
    expect(arg.userType).toBe(2)
  })

  it('register：rider → userType=3', async () => {
    const { service, register } = makeService()
    const ctrl = new PushTokenController(service)
    const dto: PushRegisterDto = { platform: 'android', registrationId: 'X' }
    await ctrl.register(dto, makeUser('r-1', 'rider'))
    const arg = register.mock.calls[0][0] as { userType: number }
    expect(arg.userType).toBe(3)
  })

  it('register：admin → userType=0（不在三端清单内 → service 自行处理）', async () => {
    const { service, register } = makeService()
    const ctrl = new PushTokenController(service)
    const dto: PushRegisterDto = { platform: 'android', registrationId: 'X' }
    await ctrl.register(dto, makeUser('a-1', 'admin'))
    const arg = register.mock.calls[0][0] as { userType: number }
    expect(arg.userType).toBe(0)
  })

  /* ============================================================================ */
  /* 2) register：未登录 → no_auth                                                  */
  /* ============================================================================ */
  it('register 未登录 → ok=false / no_auth（service 不被调用）', async () => {
    const { service, register } = makeService()
    const ctrl = new PushTokenController(service)
    const dto: PushRegisterDto = { platform: 'ios', registrationId: 'X' }
    /* @ts-expect-error 测试 user 为 undefined 路径 */
    const r = await ctrl.register(dto, undefined)
    expect(r.ok).toBe(false)
    expect(r.message).toBe('no_auth')
    expect(register).not.toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 3) unregister：deviceId 透传                                                   */
  /* ============================================================================ */
  it('unregister 透传 deviceId 给 service', async () => {
    const { service, unregister } = makeService()
    const ctrl = new PushTokenController(service)
    const r = await ctrl.unregister('d-1', makeUser('u-1', 'user'))
    expect(r.ok).toBe(true)
    expect(unregister).toHaveBeenCalledWith('u-1', 1, 'd-1')
  })

  it('unregister 不传 deviceId → service 收到 undefined', async () => {
    const { service, unregister } = makeService()
    const ctrl = new PushTokenController(service)
    await ctrl.unregister(undefined, makeUser('u-1', 'rider'))
    expect(unregister).toHaveBeenCalledWith('u-1', 3, undefined)
  })

  /* ============================================================================ */
  /* 4) unregister 未登录                                                           */
  /* ============================================================================ */
  it('unregister 未登录 → no_auth', async () => {
    const { service, unregister } = makeService()
    const ctrl = new PushTokenController(service)
    /* @ts-expect-error 测试 user 为 undefined 路径 */
    const r = await ctrl.unregister('d', undefined)
    expect(r.ok).toBe(false)
    expect(r.message).toBe('no_auth')
    expect(unregister).not.toHaveBeenCalled()
  })

  /* ============================================================================ */
  /* 5) heartbeat                                                                   */
  /* ============================================================================ */
  it('heartbeat：透传 deviceId', async () => {
    const { service, heartbeat } = makeService()
    const ctrl = new PushTokenController(service)
    const r = await ctrl.heartbeat({ deviceId: 'd-1' }, makeUser('m-1', 'merchant'))
    expect(r.ok).toBe(true)
    expect(heartbeat).toHaveBeenCalledWith('m-1', 2, 'd-1')
  })

  it('heartbeat：body 为 undefined / 无 deviceId → service 收到 undefined', async () => {
    const { service, heartbeat } = makeService()
    const ctrl = new PushTokenController(service)
    await ctrl.heartbeat(undefined, makeUser('u-1', 'user'))
    expect(heartbeat).toHaveBeenCalledWith('u-1', 1, undefined)
  })

  it('heartbeat 未登录 → no_auth', async () => {
    const { service, heartbeat } = makeService()
    const ctrl = new PushTokenController(service)
    /* @ts-expect-error 测试 user 为 undefined 路径 */
    const r = await ctrl.heartbeat({ deviceId: 'd' }, undefined)
    expect(r.ok).toBe(false)
    expect(r.message).toBe('no_auth')
    expect(heartbeat).not.toHaveBeenCalled()
  })
})
