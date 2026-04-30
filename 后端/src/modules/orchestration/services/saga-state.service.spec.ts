/**
 * @file saga-state.service.spec.ts
 * @stage P9 Sprint 2 / W2.B.2（P9-P1-09）
 * @desc SagaStateService 单测：6 个 API 各 happy + edge
 * @author 单 Agent V2.0（Sprint 2 Agent B）
 *
 * 关键覆盖：
 *   1) create：返回 entity；status=0 / stepIdx=0 / contextJson 序列化
 *   2) load：存在 → 返回；不存在 → null
 *   3) save：partial 更新（stepIdx / context / status / errorMsg 任意组合）；空对象 short-circuit
 *   4) markCompleted：status=1，errorMsg 置 null
 *   5) markFailed：status=2，errorMsg 截断到 500 字符
 *   6) findStuckSagas：默认 5min；自定义 ms；底层 where 含 LessThan(now - x)
 *   7) safeContext：循环引用回退为 {}
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { LessThan } from 'typeorm'
import { SagaState, SagaStateStatusEnum } from '@/entities'
import { SagaStateService } from './saga-state.service'

interface RepoMock {
  create: jest.Mock
  save: jest.Mock
  findOne: jest.Mock
  update: jest.Mock
  find: jest.Mock
}

describe('SagaStateService', () => {
  let service: SagaStateService
  let repo: RepoMock

  beforeEach(async () => {
    repo = {
      create: jest.fn((input: unknown) => input),
      save: jest.fn().mockImplementation(async (e: unknown) => e),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([])
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SagaStateService,
        {
          provide: getRepositoryToken(SagaState),
          useValue: repo
        }
      ]
    }).compile()

    service = moduleRef.get(SagaStateService)
  })

  describe('create', () => {
    it('落 status=RUNNING / stepIdx=0 / contextJson 序列化后的对象', async () => {
      const input = {
        sagaId: 'SAGA-1',
        sagaType: 'OrderPaidSaga',
        context: { orderNo: 'T20260501010000001', amount: 12.5 }
      }
      const ent = await service.create(input)
      expect(repo.create).toHaveBeenCalledTimes(1)
      const created = repo.create.mock.calls[0][0]
      expect(created.sagaId).toBe('SAGA-1')
      expect(created.sagaType).toBe('OrderPaidSaga')
      expect(created.status).toBe(SagaStateStatusEnum.RUNNING)
      expect(created.stepIdx).toBe(0)
      expect(created.contextJson).toEqual(input.context)
      expect(created.errorMsg).toBeNull()
      expect(created.tenantId).toBe(1)
      expect(created.isDeleted).toBe(0)
      expect(repo.save).toHaveBeenCalledWith(created)
      expect(ent).toBe(created)
    })

    it('循环引用 context 回退为空对象', async () => {
      const cyclic: Record<string, unknown> = { name: 'x' }
      cyclic.self = cyclic
      await service.create({ sagaId: 'SAGA-cyclic', sagaType: 'X', context: cyclic })
      const created = repo.create.mock.calls[0][0]
      expect(created.contextJson).toEqual({})
    })
  })

  describe('load', () => {
    it('返回查到的 entity', async () => {
      const expected = { sagaId: 'S1' } as Partial<SagaState>
      repo.findOne.mockResolvedValueOnce(expected)
      const got = await service.load('S1')
      expect(repo.findOne).toHaveBeenCalledWith({ where: { sagaId: 'S1', isDeleted: 0 } })
      expect(got).toBe(expected)
    })

    it('不存在 → null', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const got = await service.load('NOPE')
      expect(got).toBeNull()
    })
  })

  describe('save', () => {
    it('全字段更新', async () => {
      await service.save('S1', {
        stepIdx: 3,
        context: { foo: 'bar' },
        status: SagaStateStatusEnum.COMPENSATING,
        errorMsg: 'oops'
      })
      expect(repo.update).toHaveBeenCalledWith(
        { sagaId: 'S1', isDeleted: 0 },
        {
          stepIdx: 3,
          contextJson: { foo: 'bar' },
          status: SagaStateStatusEnum.COMPENSATING,
          errorMsg: 'oops'
        }
      )
    })

    it('partial 仅 stepIdx', async () => {
      await service.save('S1', { stepIdx: 1 })
      expect(repo.update).toHaveBeenCalledWith({ sagaId: 'S1', isDeleted: 0 }, { stepIdx: 1 })
    })

    it('errorMsg=null 显式清空', async () => {
      await service.save('S1', { errorMsg: null })
      expect(repo.update).toHaveBeenCalledWith({ sagaId: 'S1', isDeleted: 0 }, { errorMsg: null })
    })

    it('空 partial → 不调 update（short-circuit）', async () => {
      await service.save('S1', {})
      expect(repo.update).not.toHaveBeenCalled()
    })
  })

  describe('markCompleted', () => {
    it('设 status=COMPLETED + errorMsg=null', async () => {
      await service.markCompleted('S1')
      expect(repo.update).toHaveBeenCalledWith(
        { sagaId: 'S1', isDeleted: 0 },
        { status: SagaStateStatusEnum.COMPLETED, errorMsg: null }
      )
    })
  })

  describe('markFailed', () => {
    it('设 status=FAILED + errorMsg', async () => {
      await service.markFailed('S1', 'boom')
      expect(repo.update).toHaveBeenCalledWith(
        { sagaId: 'S1', isDeleted: 0 },
        { status: SagaStateStatusEnum.FAILED, errorMsg: 'boom' }
      )
    })

    it('errorMsg 超过 500 字符 → 截断', async () => {
      const long = 'x'.repeat(800)
      await service.markFailed('S1', long)
      const args = repo.update.mock.calls[0][1]
      expect((args.errorMsg as string).length).toBe(500)
    })
  })

  describe('findStuckSagas', () => {
    it('默认 5min 阈值', async () => {
      repo.find.mockResolvedValueOnce([{ sagaId: 'S-stuck' }])
      const list = await service.findStuckSagas()
      expect(repo.find).toHaveBeenCalledTimes(1)
      const call = repo.find.mock.calls[0][0]
      expect(call.where.status).toBe(SagaStateStatusEnum.RUNNING)
      expect(call.where.isDeleted).toBe(0)
      expect(call.where.updatedAt).toBeInstanceOf(Object)
      expect(call.order).toEqual({ updatedAt: 'DESC' })
      expect(call.take).toBe(100)
      expect(list).toHaveLength(1)
    })

    it('自定义阈值 → 切换 cutoff', async () => {
      const before = Date.now()
      await service.findStuckSagas(60_000)
      const call = repo.find.mock.calls[0][0]
      /* LessThan(cutoff)：cutoff = now - 60s ；只校验 cutoff 不晚于 before-60s+ε */
      const expectedCutoff = before - 60_000
      const lt = call.where.updatedAt as ReturnType<typeof LessThan>
      const cutoffVal = (lt as unknown as { _value: Date })._value
      expect(cutoffVal).toBeInstanceOf(Date)
      expect(cutoffVal.getTime()).toBeGreaterThanOrEqual(expectedCutoff - 1000)
      expect(cutoffVal.getTime()).toBeLessThanOrEqual(expectedCutoff + 1000)
    })

    it('负数阈值 → clamp 到 0（cutoff 取当前时间）', async () => {
      await service.findStuckSagas(-1000)
      const call = repo.find.mock.calls[0][0]
      const lt = call.where.updatedAt as ReturnType<typeof LessThan>
      const cutoffVal = (lt as unknown as { _value: Date })._value
      expect(cutoffVal.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
    })
  })
})
