/**
 * @file admin-finance-ext.controller.spec.ts
 * @stage P9 Sprint 4 / W4.B.2
 * @desc AdminFinanceExtController 单测：3 个路由透传 service
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { AdminFinanceExtService } from '../services/admin-finance-ext.service'
import { AdminFinanceExtController } from './admin-finance-ext.controller'

const passGuard = { canActivate: () => true }

describe('AdminFinanceExtController', () => {
  let controller: AdminFinanceExtController
  let service: {
    getOverview: jest.Mock
    getBillList: jest.Mock
    retrySettlement: jest.Mock
  }

  beforeEach(async () => {
    service = {
      getOverview: jest.fn().mockResolvedValue({
        income: '0.00',
        commission: '0.00',
        refund: '0.00',
        balance: '0.00',
        trend: []
      }),
      getBillList: jest.fn().mockResolvedValue({
        list: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 }
      }),
      retrySettlement: jest.fn().mockResolvedValue({
        retried: true,
        recordId: 'R1',
        orderNo: 'O1',
        status: 1
      })
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminFinanceExtController],
      providers: [{ provide: AdminFinanceExtService, useValue: service }]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passGuard)
      .overrideGuard(UserTypeGuard)
      .useValue(passGuard)
      .overrideGuard(PermissionGuard)
      .useValue(passGuard)
      .compile()
    controller = moduleRef.get(AdminFinanceExtController)
  })

  it('overview 透传 query', async () => {
    await controller.overview({ startDate: '2025-01-01', endDate: '2025-01-31' })
    expect(service.getOverview).toHaveBeenCalledWith({
      startDate: '2025-01-01',
      endDate: '2025-01-31'
    })
  })

  it('billList 透传 query', async () => {
    await controller.billList({ page: 2, pageSize: 10, ownerType: 2 })
    expect(service.getBillList).toHaveBeenCalledWith({ page: 2, pageSize: 10, ownerType: 2 })
  })

  it('settlementRecordRetry 透传 id（opAdminId 仅留痕）', async () => {
    const r = await controller.settlementRecordRetry('R1', 'A1')
    expect(service.retrySettlement).toHaveBeenCalledWith('R1')
    expect(r.retried).toBe(true)
  })
})
