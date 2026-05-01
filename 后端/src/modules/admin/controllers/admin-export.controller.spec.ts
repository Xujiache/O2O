/**
 * @file admin-export.controller.spec.ts
 * @stage P9 Sprint 4 / W4.B.1
 * @desc AdminExportController 单测：3 个路由均透传到 service
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { AdminExportService } from '../services/admin-export.service'
import { AdminExportController } from './admin-export.controller'

const passGuard = { canActivate: () => true }

describe('AdminExportController', () => {
  let controller: AdminExportController
  let service: {
    createJob: jest.Mock
    getJob: jest.Mock
    cancelJob: jest.Mock
  }

  beforeEach(async () => {
    service = {
      createJob: jest.fn().mockResolvedValue({ jobId: 'J' }),
      getJob: jest.fn().mockResolvedValue({ status: 'PENDING' }),
      cancelJob: jest.fn().mockResolvedValue({ canceled: true })
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminExportController],
      providers: [{ provide: AdminExportService, useValue: service }]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passGuard)
      .overrideGuard(UserTypeGuard)
      .useValue(passGuard)
      .overrideGuard(PermissionGuard)
      .useValue(passGuard)
      .compile()
    controller = moduleRef.get(AdminExportController)
  })

  it('createJob 透传 module / query / adminId', async () => {
    const r = await controller.createJob('A1', { module: 'order', query: { p: 1 } })
    expect(r.jobId).toBe('J')
    expect(service.createJob).toHaveBeenCalledWith({
      module: 'order',
      query: { p: 1 },
      adminId: 'A1'
    })
  })

  it('createJob 缺省 query → 透传空对象', async () => {
    await controller.createJob('A2', { module: 'rider' })
    expect(service.createJob.mock.calls[0][0].query).toEqual({})
  })

  it('getJob 透传 id', async () => {
    const r = await controller.getJob('JOB-1')
    expect(service.getJob).toHaveBeenCalledWith('JOB-1')
    expect(r.status).toBe('PENDING')
  })

  it('cancelJob 透传 id 并返回 canceled', async () => {
    const r = await controller.cancelJob('JOB-2')
    expect(service.cancelJob).toHaveBeenCalledWith('JOB-2')
    expect(r.canceled).toBe(true)
  })
})
