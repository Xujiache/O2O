/**
 * @file admin-dashboard.controller.spec.ts
 * @stage P9 Sprint 4 / W4.C.3
 * @desc AdminDashboardController 路由单测：透传 service 层
 * @author Sprint4-Agent C
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { AdminDashboardController } from './admin-dashboard.controller'
import { AdminDashboardService } from '../services/admin-dashboard.service'

const passGuard = { canActivate: () => true }

describe('AdminDashboardController', () => {
  let controller: AdminDashboardController
  let service: { overview: jest.Mock; trend: jest.Mock }

  beforeEach(async () => {
    service = {
      overview: jest.fn(),
      trend: jest.fn()
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminDashboardController],
      providers: [{ provide: AdminDashboardService, useValue: service }]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passGuard)
      .overrideGuard(UserTypeGuard)
      .useValue(passGuard)
      .overrideGuard(PermissionGuard)
      .useValue(passGuard)
      .compile()
    controller = moduleRef.get(AdminDashboardController)
  })

  it('GET overview → service.overview', async () => {
    service.overview.mockResolvedValueOnce({
      todayOrderCount: 1,
      todayGmv: '0.00',
      activeUsers: 0,
      activeRiders: 0,
      generatedAt: 'now'
    })
    const ret = await controller.overview()
    expect(service.overview).toHaveBeenCalled()
    expect(ret.todayOrderCount).toBe(1)
  })

  it('GET trend → service.trend（返回数组）', async () => {
    service.trend.mockResolvedValueOnce([{ date: '2026-04-25', orderCount: 0, gmv: '0.00' }])
    const ret = await controller.trend()
    expect(service.trend).toHaveBeenCalled()
    expect(ret).toHaveLength(1)
    expect(ret[0].gmv).toBe('0.00')
  })
})
