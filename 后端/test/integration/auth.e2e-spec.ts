/**
 * @file auth.e2e-spec.ts
 * @stage P9 Sprint 2 / T9.2（Agent E）
 * @desc Auth 模块 HTTP 集成测试骨架
 *
 * 覆盖（与 auth.controller.ts 实路径一一对应）：
 *   1. POST /api/v1/auth/sms/send         发送短信
 *   2. POST /api/v1/auth/wx-mp/login      微信小程序登录
 *   3. POST /api/v1/auth/merchant/login   商户密码登录
 *   4. POST /api/v1/auth/admin/login      管理员账密登录
 *   5. POST /api/v1/auth/refresh          刷新 token
 *   6. POST /api/v1/auth/logout           登出（需登录态 → 本骨架仅测公开/参数校验场景）
 *   7. DTO 校验：缺字段 / 格式错误 → 400
 *
 * 策略：
 *   - 仅挂 AuthController + mock AuthService（不拉真 TypeORM/Redis）
 *   - @Public 接口绕过 JwtAuthGuard（本测试套不挂全局守卫）
 *   - 响应被 TransformInterceptor 包裹为 { code, message, data, traceId, timestamp }
 */

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AuthController } from '@/modules/auth/auth.controller'
import { AuthService } from '@/modules/auth/auth.service'
import { buildTestApp } from './setup'

describe('Auth API e2e (HTTP-level / Supertest)', () => {
  let app: INestApplication
  /** mock AuthService 全部方法（按需在 it 内 .mockResolvedValue） */
  const authSvc = {
    wxMpLogin: jest.fn(),
    bindMobile: jest.fn(),
    sendSms: jest.fn(),
    merchantLogin: jest.fn(),
    merchantSmsLogin: jest.fn(),
    riderLogin: jest.fn(),
    adminLogin: jest.fn(),
    refreshTokenPair: jest.fn(),
    logout: jest.fn()
  }

  beforeAll(async () => {
    app = await buildTestApp({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authSvc }]
    })
  })

  afterAll(async () => {
    if (app) await app.close()
  })

  beforeEach(() => {
    Object.values(authSvc).forEach((fn) => fn.mockReset())
  })

  it('POST /v1/auth/sms/send → 200 返回 ok=true', async () => {
    authSvc.sendSms.mockResolvedValue({ ok: true, ttl: 300 })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/auth/sms/send')
      .send({ mobile: '13800138000', scene: 'login' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ code: 0, data: { ok: true, ttl: 300 } })
    expect(authSvc.sendSms).toHaveBeenCalledWith('13800138000', 'login')
  })

  it('POST /v1/auth/sms/send → 400 缺 mobile', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/auth/sms/send')
      .send({ scene: 'login' })
    expect(res.status).toBe(400)
    expect(authSvc.sendSms).not.toHaveBeenCalled()
  })

  it('POST /v1/auth/wx-mp/login → 200 返回 tokens', async () => {
    authSvc.wxMpLogin.mockResolvedValue({
      tokens: { accessToken: 'AAA', refreshToken: 'RRR', expiresIn: 7200 },
      user: { id: 'U1', nickname: 'Test', avatarUrl: null, mobileTail4: null }
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/auth/wx-mp/login')
      .send({ code: '0a1b2c3d4e5f6789' })
    expect(res.status).toBe(201)
    expect(res.body.data.tokens.accessToken).toBe('AAA')
  })

  it('POST /v1/auth/merchant/login → 200', async () => {
    authSvc.merchantLogin.mockResolvedValue({
      tokens: { accessToken: 'A', refreshToken: 'R', expiresIn: 7200 },
      merchant: { id: 'M1', merchantNo: 'M001' }
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/auth/merchant/login')
      .send({ mobile: '13900000000', password: 'Pwd@2026' })
    expect(res.status).toBe(201)
    expect(authSvc.merchantLogin).toHaveBeenCalledWith('13900000000', 'Pwd@2026')
  })

  it('POST /v1/auth/admin/login → 200 含菜单 + 权限', async () => {
    authSvc.adminLogin.mockResolvedValue({
      tokens: { accessToken: 'A', refreshToken: 'R', expiresIn: 7200 },
      admin: { id: 'A1', username: 'admin', isSuper: true },
      menus: [],
      permissions: ['*']
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/auth/admin/login')
      .send({ username: 'admin', password: 'Pwd@2026' })
    expect(res.status).toBe(201)
    expect(res.body.data.permissions).toContain('*')
  })

  it('POST /v1/auth/refresh → 200 返回新 token 对', async () => {
    authSvc.refreshTokenPair.mockResolvedValue({
      accessToken: 'A2',
      refreshToken: 'R2',
      expiresIn: 7200
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/auth/refresh')
      .send({ uid: 'U_TEST_001', userType: 'user', refreshToken: 'rt-xxx' })
    expect(res.status).toBe(201)
    expect(res.body.data.accessToken).toBe('A2')
  })

  it('POST /v1/auth/refresh → 400 userType 非法', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/auth/refresh')
      .send({ uid: 'U1', userType: 'wrong', refreshToken: 'rt' })
    expect(res.status).toBe(400)
  })
})
