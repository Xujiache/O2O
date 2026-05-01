/**
 * @file admin-rider-ext.controller.spec.ts
 * @stage P9 Sprint 4 / W4.C.1 + W4.C.2
 * @desc AdminRiderExtController 路由单测：透传 service 层
 * @author Sprint4-Agent C
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { AdminRiderExtController } from './admin-rider-ext.controller'
import { AdminRiderExtService } from '../services/admin-rider-ext.service'

const passGuard = { canActivate: () => true }

describe('AdminRiderExtController', () => {
  let controller: AdminRiderExtController
  let service: {
    queryTrack: jest.Mock
    listReward: jest.Mock
    saveReward: jest.Mock
    deleteReward: jest.Mock
    listLevel: jest.Mock
    saveLevel: jest.Mock
    deleteLevel: jest.Mock
  }

  beforeEach(async () => {
    service = {
      queryTrack: jest.fn(),
      listReward: jest.fn(),
      saveReward: jest.fn(),
      deleteReward: jest.fn(),
      listLevel: jest.fn(),
      saveLevel: jest.fn(),
      deleteLevel: jest.fn()
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminRiderExtController],
      providers: [{ provide: AdminRiderExtService, useValue: service }]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passGuard)
      .overrideGuard(UserTypeGuard)
      .useValue(passGuard)
      .overrideGuard(PermissionGuard)
      .useValue(passGuard)
      .compile()
    controller = moduleRef.get(AdminRiderExtController)
  })

  it('GET track：parse startTs/endTs 字符串 → 毫秒', async () => {
    service.queryTrack.mockResolvedValueOnce({
      riderId: 'R1',
      orderNo: 'T1',
      pointCount: 0,
      geometry: { type: 'LineString', coordinates: [] },
      timestamps: [],
      properties: { startMs: 0, endMs: 0, totalDistanceM: 0, avgSpeedKmh: 0 }
    })
    const ret = await controller.track('R1', 'T1', '1714521600000', '1714521610000')
    expect(service.queryTrack).toHaveBeenCalledWith('R1', 'T1', 1714521600000, 1714521610000)
    expect(ret.geometry.type).toBe('LineString')
  })

  it('GET track：未传 startTs/endTs → undefined', async () => {
    service.queryTrack.mockResolvedValueOnce({
      riderId: 'R1',
      orderNo: 'T1',
      pointCount: 0,
      geometry: { type: 'LineString', coordinates: [] },
      timestamps: [],
      properties: { startMs: 0, endMs: 0, totalDistanceM: 0, avgSpeedKmh: 0 }
    })
    await controller.track('R1', 'T1')
    expect(service.queryTrack).toHaveBeenCalledWith('R1', 'T1', undefined, undefined)
  })

  it('GET reward/rules → service.listReward', async () => {
    service.listReward.mockResolvedValueOnce([])
    await controller.listReward()
    expect(service.listReward).toHaveBeenCalled()
  })

  it('POST reward/rules → service.saveReward', async () => {
    const body = { type: 'reward' as const, name: 'x', amount: '1' }
    service.saveReward.mockResolvedValueOnce([])
    await controller.saveReward(body)
    expect(service.saveReward).toHaveBeenCalledWith(body)
  })

  it('DELETE reward/rules/:id → service.deleteReward', async () => {
    service.deleteReward.mockResolvedValueOnce([])
    await controller.deleteReward('r1')
    expect(service.deleteReward).toHaveBeenCalledWith('r1')
  })

  it('GET level/config → service.listLevel', async () => {
    service.listLevel.mockResolvedValueOnce([])
    await controller.listLevel()
    expect(service.listLevel).toHaveBeenCalled()
  })

  it('PUT level/config → service.saveLevel', async () => {
    service.saveLevel.mockResolvedValueOnce([])
    await controller.saveLevel({ level: 1, name: 'bronze' })
    expect(service.saveLevel).toHaveBeenCalledWith({ level: 1, name: 'bronze' })
  })

  it('DELETE level/config/:level → service.deleteLevel（数字透传）', async () => {
    service.deleteLevel.mockResolvedValueOnce([])
    await controller.deleteLevel(2)
    expect(service.deleteLevel).toHaveBeenCalledWith(2)
  })
})
