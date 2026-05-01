/**
 * @file marketing.e2e-spec.ts
 * @stage P9 Sprint 3 / W3.E.2（Agent E）
 * @desc Marketing 模块 HTTP 集成测试骨架
 *
 * 覆盖（与 coupon-admin / promotion-admin / red-packet-admin / coupon-public / invite 路由一一对应）：
 *   1. POST /api/v1/admin/coupons                     新建平台券
 *   2. GET  /api/v1/admin/coupons                     券模板列表
 *   3. PUT  /api/v1/admin/coupons/:id                 编辑券模板
 *   4. POST /api/v1/admin/coupons/:id/issue           批量发券
 *   5. POST /api/v1/admin/promotions                  新建营销活动
 *   6. GET  /api/v1/admin/red-packets                 红包池列表
 *   7. POST /api/v1/coupons/:id/receive               用户领券
 *   8. POST /api/v1/me/invitations/bind               绑定邀请人
 *
 * 策略：
 *   - 仅挂相关 controller + service mock
 *   - 守卫一律放行（admin / user 身份按 path 区分）
 */

import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '@/modules/auth/guards/user-type.guard'
import { PermissionGuard } from '@/modules/auth/guards/permission.guard'
import { CouponAdminController } from '@/modules/marketing/controllers/coupon-admin.controller'
import { PromotionAdminController } from '@/modules/marketing/controllers/promotion-admin.controller'
import { RedPacketAdminController } from '@/modules/marketing/controllers/red-packet-admin.controller'
import { CouponPublicController } from '@/modules/marketing/controllers/coupon-public.controller'
import { InviteUserController } from '@/modules/marketing/controllers/invite.controller'
import { CouponService } from '@/modules/marketing/services/coupon.service'
import { UserCouponService } from '@/modules/marketing/services/user-coupon.service'
import { PromotionService } from '@/modules/marketing/services/promotion.service'
import { RedPacketService } from '@/modules/marketing/services/red-packet.service'
import { InviteRelationService } from '@/modules/marketing/services/invite-relation.service'
import { OperationLogService } from '@/modules/user/services/operation-log.service'

class PassThrough implements CanActivate {
  canActivate(): boolean {
    return true
  }
}

describe('Marketing API e2e (HTTP-level / Supertest)', () => {
  let app: INestApplication

  const couponSvc = {
    adminCreate: jest.fn(),
    adminList: jest.fn(),
    adminDetail: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    publicAvailableList: jest.fn()
  }
  const userCouponSvc = {
    receive: jest.fn(),
    list: jest.fn(),
    bestMatch: jest.fn(),
    adminIssue: jest.fn()
  }
  const promotionSvc = {
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    forceStop: jest.fn(),
    softDelete: jest.fn(),
    listForAdmin: jest.fn(),
    detail: jest.fn()
  }
  const redPacketSvc = {
    create: jest.fn(),
    adminList: jest.fn(),
    adminDetail: jest.fn(),
    adminCancel: jest.fn()
  }
  const inviteSvc = {
    bind: jest.fn(),
    listMyInvites: jest.fn(),
    getMyStat: jest.fn()
  }
  const opLogSvc = { write: jest.fn().mockResolvedValue(undefined) }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        CouponAdminController,
        PromotionAdminController,
        RedPacketAdminController,
        CouponPublicController,
        InviteUserController
      ],
      providers: [
        Reflector,
        { provide: CouponService, useValue: couponSvc },
        { provide: UserCouponService, useValue: userCouponSvc },
        { provide: PromotionService, useValue: promotionSvc },
        { provide: RedPacketService, useValue: redPacketSvc },
        { provide: InviteRelationService, useValue: inviteSvc },
        { provide: OperationLogService, useValue: opLogSvc }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<{ url?: string; user?: unknown }>()
          const url = req?.url ?? ''
          const isAdmin = url.includes('/admin/')
          req.user = isAdmin
            ? { uid: 'A_TEST_001', userType: 'admin', tenantId: 0, ver: 0, isSuper: true }
            : { uid: 'U_TEST_001', userType: 'user', tenantId: 0, ver: 0 }
          return true
        }
      })
      .overrideGuard(UserTypeGuard)
      .useClass(PassThrough)
      .overrideGuard(PermissionGuard)
      .useClass(PassThrough)
      .compile()

    app = moduleRef.createNestApplication({ logger: false })
    /* 多 controller `import type` DTO；放宽 forbidNonWhitelisted 让 body 直传 */
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: false,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: { enableImplicitConversion: true }
      })
    )
    app.useGlobalInterceptors(new TransformInterceptor())
    app.setGlobalPrefix('/api/v1', { exclude: ['/health', '/metrics'] })
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
    await app.init()
  })

  afterAll(async () => {
    if (app) await app.close()
  })

  beforeEach(() => {
    Object.values(couponSvc).forEach((fn) => fn.mockReset())
    Object.values(userCouponSvc).forEach((fn) => fn.mockReset())
    Object.values(promotionSvc).forEach((fn) => fn.mockReset())
    Object.values(redPacketSvc).forEach((fn) => fn.mockReset())
    Object.values(inviteSvc).forEach((fn) => fn.mockReset())
  })

  it('POST /v1/admin/coupons → 201 新建平台券', async () => {
    couponSvc.adminCreate.mockResolvedValue({
      id: 'CP_001',
      name: '满 100 减 10',
      issuerType: 1
    })
    const res = await request(app.getHttpServer()).post('/api/v1/v1/admin/coupons').send({
      name: '满 100 减 10',
      couponType: 1,
      discountValue: '10.00',
      minOrderAmount: '100.00',
      scene: 1,
      validType: 2,
      validDays: 7,
      totalQty: 1000,
      perUserLimit: 1
    })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBe('CP_001')
    expect(couponSvc.adminCreate).toHaveBeenCalledWith('A_TEST_001', expect.any(Object))
  })

  it('GET /v1/admin/coupons → 200 列表分页', async () => {
    couponSvc.adminList.mockResolvedValue({ list: [], total: 0, page: 1, size: 20 })
    const res = await request(app.getHttpServer())
      .get('/api/v1/v1/admin/coupons')
      .query({ page: 1, size: 20 })
    expect(res.status).toBe(200)
    expect(couponSvc.adminList).toHaveBeenCalled()
  })

  it('PUT /v1/admin/coupons/:id → 200 编辑券模板', async () => {
    couponSvc.adminUpdate.mockResolvedValue({ id: 'CP_001', name: '更新后' })
    const res = await request(app.getHttpServer())
      .put('/api/v1/v1/admin/coupons/CP_001')
      .send({ name: '更新后', description: 'desc' })
    expect(res.status).toBe(200)
    expect(couponSvc.adminUpdate).toHaveBeenCalledWith(
      'CP_001',
      'A_TEST_001',
      expect.objectContaining({ name: '更新后' })
    )
  })

  it('POST /v1/admin/coupons/:id/issue → 200 批量发券', async () => {
    userCouponSvc.adminIssue.mockResolvedValue({
      total: 10,
      issued: 8,
      skipped: ['180000000000000001', '180000000000000002']
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/admin/coupons/CP_001/issue')
      .send({
        userIds: ['180000000000000001', '180000000000000002', '180000000000000003'],
        source: 4
      })
    expect(res.status).toBe(200)
    expect(res.body.data.issued).toBe(8)
    expect(userCouponSvc.adminIssue).toHaveBeenCalledWith(
      'CP_001',
      ['180000000000000001', '180000000000000002', '180000000000000003'],
      4,
      'A_TEST_001'
    )
  })

  it('POST /v1/admin/promotions → 201 新建营销活动', async () => {
    promotionSvc.create.mockResolvedValue({ id: 'PR_001', name: '春季活动', issuerType: 1 })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/admin/promotions')
      .send({
        name: '春季活动',
        promoType: 1,
        scene: 1,
        ruleJson: { steps: [{ minAmount: '30.00', discount: '5.00' }] },
        validFrom: '2026-05-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z'
      })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBe('PR_001')
    expect(promotionSvc.create).toHaveBeenCalled()
  })

  it('GET /v1/admin/red-packets → 200 红包池列表', async () => {
    redPacketSvc.adminList.mockResolvedValue({ list: [], total: 0, page: 1, size: 20 })
    const res = await request(app.getHttpServer())
      .get('/api/v1/v1/admin/red-packets')
      .query({ page: 1, size: 20 })
    expect(res.status).toBe(200)
    expect(redPacketSvc.adminList).toHaveBeenCalled()
  })

  it('POST /v1/coupons/:id/receive → 201 用户领券', async () => {
    userCouponSvc.receive.mockResolvedValue({
      id: 'UC_001',
      couponId: 'CP_001',
      userId: 'U_TEST_001',
      status: 0
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/coupons/CP_001/receive')
      .send({})
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBe('UC_001')
    expect(userCouponSvc.receive).toHaveBeenCalledWith('U_TEST_001', 'CP_001')
  })

  it('POST /v1/me/invitations/bind → 201 绑定邀请人', async () => {
    inviteSvc.bind.mockResolvedValue({
      id: 'IR_001',
      inviteeId: 'U_TEST_001',
      inviterId: 'U_INV_001'
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/me/invitations/bind')
      .send({ inviteCode: 'INV180000000000000001' })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBe('IR_001')
    expect(inviteSvc.bind).toHaveBeenCalledWith(
      'U_TEST_001',
      expect.objectContaining({ inviteCode: 'INV180000000000000001' })
    )
  })
})
