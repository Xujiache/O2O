/**
 * @file payment.e2e-spec.ts
 * @stage P9 Sprint 2 / T9.2（Agent E）
 * @desc Payment 模块 HTTP 集成测试骨架
 *
 * 覆盖（与 payment.controller / wx-pay-notify / payment-admin 对齐）：
 *   1. POST /api/v1/payment/create                    创建支付（用户端）
 *   2. GET  /api/v1/payment/:payNo/status             查询支付状态
 *   3. POST /api/v1/payment/wx/notify                 微信支付回调（@Public）
 *   4. POST /api/v1/admin/refund/create               管理员退款
 *   5. POST /api/v1/admin/reconciliation/run          管理员触发对账
 *   6. DTO 校验：缺 orderNo / amount 格式错 → 400
 */

import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common'
import request from 'supertest'
import { Test } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '@/modules/auth/guards/user-type.guard'
import { PermissionGuard } from '@/modules/auth/guards/permission.guard'
import { PaymentController } from '@/modules/payment/controllers/payment.controller'
import { WxPayNotifyController } from '@/modules/payment/controllers/wx-pay-notify.controller'
import {
  RefundAdminController,
  ReconciliationAdminController,
  ReconciliationListAdminController
} from '@/modules/payment/controllers/payment-admin.controller'
import { PaymentService } from '@/modules/payment/services/payment.service'
import { RefundService } from '@/modules/payment/services/refund.service'
import { ReconciliationService } from '@/modules/payment/services/reconciliation.service'
import { WxPayAdapter } from '@/modules/payment/adapters/wx-pay.adapter'
import { PaymentStateMachine } from '@/modules/payment/services/payment-state-machine'

class PassUser implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: unknown }>()
    req.user = { uid: 'U_TEST_001', userType: 'user', tenantId: 0, ver: 0 }
    return true
  }
}
class PassAdmin implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: unknown }>()
    req.user = { uid: 'A_TEST_001', userType: 'admin', tenantId: 0, ver: 0, isSuper: true }
    return true
  }
}
class PassThrough implements CanActivate {
  canActivate(): boolean {
    return true
  }
}

describe('Payment API e2e (HTTP-level / Supertest)', () => {
  let app: INestApplication
  const paymentSvc = { create: jest.fn(), queryStatus: jest.fn() }
  const refundSvc = { createRefund: jest.fn() }
  const reconSvc = { manualRun: jest.fn(), list: jest.fn(), detail: jest.fn() }
  const wxAdapter = { verifyNotify: jest.fn() }
  const stateMachine = { transit: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        PaymentController,
        WxPayNotifyController,
        RefundAdminController,
        ReconciliationAdminController,
        ReconciliationListAdminController
      ],
      providers: [
        Reflector,
        { provide: PaymentService, useValue: paymentSvc },
        { provide: RefundService, useValue: refundSvc },
        { provide: ReconciliationService, useValue: reconSvc },
        { provide: WxPayAdapter, useValue: wxAdapter },
        { provide: PaymentStateMachine, useValue: stateMachine }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(PassUser)
      .overrideGuard(UserTypeGuard)
      .useClass(PassThrough)
      .overrideGuard(PermissionGuard)
      .useClass(PassThrough)
      .compile()

    app = moduleRef.createNestApplication({ logger: false })
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
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
    paymentSvc.create.mockReset()
    paymentSvc.queryStatus.mockReset()
    refundSvc.createRefund.mockReset()
    reconSvc.manualRun.mockReset()
    wxAdapter.verifyNotify.mockReset()
    stateMachine.transit.mockReset()
  })

  it('POST /v1/payment/create → 200 余额支付', async () => {
    paymentSvc.create.mockResolvedValue({
      payNo: 'P202605010000000000000000001',
      payMethod: 3,
      status: 2,
      amount: '50.00',
      prepayParams: {},
      mockMode: true
    })
    const res = await request(app.getHttpServer()).post('/api/v1/v1/payment/create').send({
      orderNo: '180000000000000001',
      orderType: 1,
      amount: '50.00',
      payMethod: 3
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe(2)
  })

  it('POST /v1/payment/create → 400 amount 格式错', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/v1/payment/create').send({
      orderNo: '180000000000000001',
      orderType: 1,
      amount: 'NOT_A_NUMBER',
      payMethod: 1
    })
    expect(res.status).toBe(400)
  })

  it('GET /v1/payment/:payNo/status → 200', async () => {
    paymentSvc.queryStatus.mockResolvedValue({
      payNo: 'P202605010000000000000000001',
      orderNo: '180000000000000001',
      orderType: 1,
      amount: '50.00',
      payMethod: 3,
      status: 2,
      payAt: new Date(),
      outTradeNo: null,
      channel: 'mock'
    })
    const res = await request(app.getHttpServer()).get(
      '/api/v1/v1/payment/P202605010000000000000000001/status'
    )
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe(2)
  })

  it('POST /v1/payment/wx/notify → SUCCESS（验签通过）', async () => {
    wxAdapter.verifyNotify.mockReturnValue({
      ok: true,
      payload: {
        payNo: 'P202605010000000000000000001',
        outTradeNo: 'WX_OUT_001',
        paidAt: new Date(),
        tradeStatus: 'SUCCESS',
        raw: {}
      }
    })
    stateMachine.transit.mockResolvedValue({ from: 1, to: 2, idempotent: false })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/payment/wx/notify')
      .send({ resource: { ciphertext: 'fake' } })
    expect(res.status).toBe(200)
    expect(res.body.data.code).toBe('SUCCESS')
    expect(stateMachine.transit).toHaveBeenCalled()
  })

  it('POST /v1/payment/wx/notify → FAIL（验签失败）', async () => {
    wxAdapter.verifyNotify.mockReturnValue({ ok: false, reason: '签名错误' })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/payment/wx/notify')
      .send({ resource: {} })
    expect(res.status).toBe(200)
    expect(res.body.data.code).toBe('FAIL')
    expect(stateMachine.transit).not.toHaveBeenCalled()
  })

  it('POST /v1/admin/refund/create → 200', async () => {
    refundSvc.createRefund.mockResolvedValue({
      refundNo: 'REF001',
      payNo: 'P202605010000000000000000001',
      amount: '10.00',
      status: 2,
      outRefundNo: null,
      balanceResult: undefined
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/admin/refund/create')
      .send({ payNo: 'P202605010000000000000000001', amount: '10.00', reason: '商户原因' })
    expect(res.status).toBe(200)
    expect(res.body.data.refundNo).toBe('REF001')
  })

  it('POST /v1/admin/reconciliation/run → 200', async () => {
    reconSvc.manualRun.mockResolvedValue({
      channel: 'wx',
      billDate: '2026-05-01',
      totalOrders: 100,
      totalAmount: '1000.00',
      diffCount: 0,
      status: 1,
      reconNo: 'RECON001',
      upsert: 'inserted'
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/admin/reconciliation/run')
      .send({ channel: 'wxpay', billDate: '2026-05-01' })
    expect(res.status).toBe(200)
    expect(res.body.data.upsert).toBe('inserted')
  })
})
