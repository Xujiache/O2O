/**
 * @file review.e2e-spec.ts
 * @stage P9 Sprint 3 / W3.E.2（Agent E）
 * @desc Review 模块 HTTP 集成测试骨架
 *
 * 覆盖（与 admin-review.controller.ts 路由一一对应）：
 *   1. GET  /api/v1/admin/reviews                       管理员评价列表
 *   2. POST /api/v1/admin/reviews/:id/hide              违规处理：隐藏评价
 *   3. GET  /api/v1/admin/review-appeals                申诉工作台
 *   4. POST /api/v1/admin/review-appeals/:id/audit      申诉审核（pass/reject）
 *   5. GET  /api/v1/admin/arbitrations                  仲裁工作台
 *   6. POST /api/v1/admin/arbitrations/:id/judge        仲裁裁决
 *   7. GET  /api/v1/admin/tickets                       工单工作台
 *   8. POST /api/v1/admin/tickets/:id/assign            分派工单
 *
 * 策略（同 Sprint 2 finance / dispatch）：
 *   - 仅挂 AdminReviewController + service mock
 *   - JwtAuthGuard / UserTypeGuard / PermissionGuard 一律放行（注入 admin 身份）
 *   - 响应被 TransformInterceptor 包裹为 { code, message, data, traceId, timestamp }
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
import { AdminReviewController } from '@/modules/review/controllers/admin-review.controller'
import { ReviewService } from '@/modules/review/services/review.service'
import { ReviewReplyService } from '@/modules/review/services/review-reply.service'
import { ReviewAppealService } from '@/modules/review/services/review-appeal.service'
import { ComplaintService } from '@/modules/review/services/complaint.service'
import { TicketService } from '@/modules/review/services/ticket.service'
import { ArbitrationService } from '@/modules/review/services/arbitration.service'
import { AfterSaleService } from '@/modules/review/services/after-sale.service'

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

describe('Review API e2e (HTTP-level / Supertest)', () => {
  let app: INestApplication

  const reviewSvc = {
    listForAdmin: jest.fn(),
    hide: jest.fn(),
    top: jest.fn()
  }
  const replySvc = { adminReply: jest.fn() }
  const appealSvc = { listForAdmin: jest.fn(), audit: jest.fn() }
  const complaintSvc = {
    listForAdmin: jest.fn(),
    handle: jest.fn(),
    escalate: jest.fn()
  }
  const ticketSvc = {
    listForAdmin: jest.fn(),
    assign: jest.fn(),
    reply: jest.fn(),
    close: jest.fn()
  }
  const arbSvc = { listForAdmin: jest.fn(), judge: jest.fn() }
  const afterSaleSvc = { listForAdmin: jest.fn(), adminResolve: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminReviewController],
      providers: [
        Reflector,
        { provide: ReviewService, useValue: reviewSvc },
        { provide: ReviewReplyService, useValue: replySvc },
        { provide: ReviewAppealService, useValue: appealSvc },
        { provide: ComplaintService, useValue: complaintSvc },
        { provide: TicketService, useValue: ticketSvc },
        { provide: ArbitrationService, useValue: arbSvc },
        { provide: AfterSaleService, useValue: afterSaleSvc }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(PassAdmin)
      .overrideGuard(UserTypeGuard)
      .useClass(PassThrough)
      .overrideGuard(PermissionGuard)
      .useClass(PassThrough)
      .compile()

    app = moduleRef.createNestApplication({ logger: false })
    /* admin-review controller 多处使用 import type DTO；放宽 forbidNonWhitelisted 让 body 直传 */
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
    Object.values(reviewSvc).forEach((fn) => fn.mockReset())
    Object.values(appealSvc).forEach((fn) => fn.mockReset())
    Object.values(arbSvc).forEach((fn) => fn.mockReset())
    Object.values(ticketSvc).forEach((fn) => fn.mockReset())
    Object.values(complaintSvc).forEach((fn) => fn.mockReset())
    Object.values(afterSaleSvc).forEach((fn) => fn.mockReset())
    replySvc.adminReply.mockReset()
  })

  it('GET /v1/admin/reviews → 200 列表', async () => {
    reviewSvc.listForAdmin.mockResolvedValue({ list: [], total: 0, page: 1, size: 20 })
    const res = await request(app.getHttpServer())
      .get('/api/v1/v1/admin/reviews')
      .query({ page: 1, size: 20 })
    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(0)
    expect(reviewSvc.listForAdmin).toHaveBeenCalled()
  })

  it('POST /v1/admin/reviews/:id/hide → 200 隐藏评价', async () => {
    reviewSvc.hide.mockResolvedValue({ id: 'REV_001', isHidden: 1 })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/admin/reviews/REV_001/hide')
      .send({ reason: '违规内容' })
    expect(res.status).toBe(201)
    expect(res.body.data.isHidden).toBe(1)
    expect(reviewSvc.hide).toHaveBeenCalledWith(
      'REV_001',
      'A_TEST_001',
      expect.objectContaining({ reason: '违规内容' })
    )
  })

  it('GET /v1/admin/review-appeals → 200 申诉工作台', async () => {
    appealSvc.listForAdmin.mockResolvedValue({ list: [], total: 0, page: 1, size: 20 })
    const res = await request(app.getHttpServer())
      .get('/api/v1/v1/admin/review-appeals')
      .query({ page: 1, size: 20 })
    expect(res.status).toBe(200)
    expect(appealSvc.listForAdmin).toHaveBeenCalled()
  })

  it('POST /v1/admin/review-appeals/:id/audit → 200 通过申诉', async () => {
    appealSvc.audit.mockResolvedValue({ id: 'AP_001', status: 1 })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/admin/review-appeals/AP_001/audit')
      .send({ action: 'pass', remark: '同意申诉' })
    expect(res.status).toBe(201)
    expect(appealSvc.audit).toHaveBeenCalledWith(
      'AP_001',
      'A_TEST_001',
      expect.objectContaining({ action: 'pass' })
    )
  })

  it('POST /v1/admin/review-appeals/:id/audit → 200 驳回申诉', async () => {
    appealSvc.audit.mockResolvedValue({ id: 'AP_002', status: 2 })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/admin/review-appeals/AP_002/audit')
      .send({ action: 'reject', remark: '证据不足' })
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe(2)
    expect(appealSvc.audit).toHaveBeenCalledWith(
      'AP_002',
      'A_TEST_001',
      expect.objectContaining({ action: 'reject' })
    )
  })

  it('GET /v1/admin/arbitrations → 200 仲裁工作台', async () => {
    arbSvc.listForAdmin.mockResolvedValue({ list: [], total: 0, page: 1, size: 20 })
    const res = await request(app.getHttpServer())
      .get('/api/v1/v1/admin/arbitrations')
      .query({ page: 1, size: 20 })
    expect(res.status).toBe(200)
    expect(arbSvc.listForAdmin).toHaveBeenCalled()
  })

  it('POST /v1/admin/arbitrations/:id/judge → 200 仲裁裁决', async () => {
    arbSvc.judge.mockResolvedValue({ id: 'AR_001', status: 1, decision: 1 })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/admin/arbitrations/AR_001/judge')
      .send({ decision: 1, decisionAmount: '20.00', decisionDetail: '支持申请方裁决详情' })
    expect(res.status).toBe(201)
    expect(res.body.data.decision).toBe(1)
    expect(arbSvc.judge).toHaveBeenCalledWith(
      'AR_001',
      'A_TEST_001',
      expect.objectContaining({ decision: 1 })
    )
  })

  it('GET /v1/admin/tickets → 200 工单工作台', async () => {
    ticketSvc.listForAdmin.mockResolvedValue({ list: [], total: 0, page: 1, size: 20 })
    const res = await request(app.getHttpServer())
      .get('/api/v1/v1/admin/tickets')
      .query({ status: 0 })
    expect(res.status).toBe(200)
    expect(ticketSvc.listForAdmin).toHaveBeenCalled()
  })

  it('POST /v1/admin/tickets/:id/assign → 200 分派工单', async () => {
    ticketSvc.assign.mockResolvedValue({ id: 'TK_001', assignee: 'A_AGENT_001', status: 1 })
    const res = await request(app.getHttpServer())
      .post('/api/v1/v1/admin/tickets/TK_001/assign')
      .send({ assigneeAdminId: 'A_AGENT_001' })
    expect(res.status).toBe(201)
    expect(ticketSvc.assign).toHaveBeenCalledWith(
      'TK_001',
      'A_TEST_001',
      expect.objectContaining({ assigneeAdminId: 'A_AGENT_001' })
    )
  })
})
