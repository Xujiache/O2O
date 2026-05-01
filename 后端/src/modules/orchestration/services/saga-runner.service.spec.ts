/**
 * @file saga-runner.service.spec.ts
 * @stage P4/T4.49 + T4.52（Sprint 8）
 * @desc SagaRunner 单测：步骤顺序执行 + 失败补偿 + DLQ 投递
 * @author 单 Agent V2.0（Subagent 7）
 *
 * 关键覆盖：
 *   1) 全部 step 成功 → executedSteps 含全部步骤名 + failedStep=null + 不投 DLQ
 *   2) 中途某 step 抛错 → 反向 compensate 已成功步骤 + 投 DLQ
 *   3) compensate 抛错 → 仅 warn 不重抛 + 后续 step 仍能执行 compensate
 *   4) DLQ enqueue 失败 → 仅 logger.error 不影响返回
 *   5) initialState 透传给 step.run 的 ctx
 *   6) 不同 saga 触发不同 sagaId（雪花字符串唯一）
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import {
  EventSourceEnum,
  ORCHESTRATION_DLQ_QUEUE,
  type EventEnvelope,
  type SagaContext,
  type SagaStep
} from '../types/orchestration.types'
import { SagaRunnerService } from './saga-runner.service'
import { SagaStateService } from './saga-state.service'

interface QueueMock {
  add: jest.Mock
}

interface SagaStateMock {
  create: jest.Mock
  load: jest.Mock
  save: jest.Mock
  markCompleted: jest.Mock
  markFailed: jest.Mock
  findStuckSagas: jest.Mock
}

describe('SagaRunnerService', () => {
  let runner: SagaRunnerService
  let dlqQueue: QueueMock

  const buildEnvelope = (
    eventName = 'OrderPaid',
    body: unknown = { orderNo: 'T20260419000001234' }
  ): EventEnvelope => ({
    source: EventSourceEnum.ORDER,
    eventName,
    body,
    receivedAt: Date.now(),
    traceId: ''
  })

  beforeEach(async () => {
    dlqQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SagaRunnerService,
        {
          provide: getQueueToken(ORCHESTRATION_DLQ_QUEUE),
          useValue: dlqQueue
        }
      ]
    }).compile()

    runner = moduleRef.get(SagaRunnerService)
  })

  describe('happy path', () => {
    it('all steps succeed -> failedStep=null + no DLQ', async () => {
      const ran: string[] = []
      const steps: SagaStep[] = [
        { name: 'A', run: async () => void ran.push('A') },
        { name: 'B', run: async () => void ran.push('B') },
        { name: 'C', run: async () => void ran.push('C') }
      ]

      const result = await runner.execute('Saga1', buildEnvelope(), steps)
      expect(ran).toEqual(['A', 'B', 'C'])
      expect(result.failedStep).toBeNull()
      expect(result.executedSteps).toEqual(['A', 'B', 'C'])
      expect(result.compensated).toBe(0)
      expect(dlqQueue.add).not.toHaveBeenCalled()
    })

    it('returns unique sagaId per execute', async () => {
      const r1 = await runner.execute('Saga1', buildEnvelope(), [])
      const r2 = await runner.execute('Saga1', buildEnvelope(), [])
      expect(r1.sagaId).not.toBe(r2.sagaId)
    })

    it('initialState passed to step.ctx', async () => {
      let captured: { count: number } | null = null
      const steps: SagaStep<SagaContext<{ count: number }>>[] = [
        {
          name: 'CaptureState',
          run: async (ctx) => {
            captured = ctx.state
          }
        }
      ]
      await runner.execute('Saga1', buildEnvelope(), steps, { count: 42 })
      expect(captured).toEqual({ count: 42 })
    })
  })

  describe('failure path', () => {
    it('step 2 fails -> compensate step 1 in reverse + DLQ', async () => {
      const compensated: string[] = []
      const steps: SagaStep[] = [
        {
          name: 'A',
          run: async () => undefined,
          compensate: async () => void compensated.push('A')
        },
        {
          name: 'B',
          run: async () => {
            throw new Error('boom')
          }
        }
      ]

      const result = await runner.execute('Saga1', buildEnvelope(), steps)
      expect(result.failedStep).toBe('B')
      expect(result.error).toBe('boom')
      expect(result.executedSteps).toEqual(['A'])
      expect(result.compensated).toBe(1)
      expect(compensated).toEqual(['A'])
      expect(dlqQueue.add).toHaveBeenCalledTimes(1)
      const job = dlqQueue.add.mock.calls[0]?.[1]
      expect(job).toMatchObject({
        sagaName: 'Saga1',
        failedStep: 'B',
        error: 'boom',
        executedSteps: ['A']
      })
    })

    it('compensate 抛非 Error 值（string）→ String(err) 分支命中', async () => {
      const compensated: string[] = []
      const steps: SagaStep[] = [
        {
          name: 'A',
          run: async () => undefined,
          compensate: async () => void compensated.push('A')
        },
        {
          name: 'B',
          run: async () => undefined,
          compensate: async () => {
            throw 'compensate-non-error'
          }
        },
        {
          name: 'C',
          run: async () => {
            throw new Error('boom')
          }
        }
      ]
      const result = await runner.execute('Saga1', buildEnvelope(), steps)
      expect(result.failedStep).toBe('C')
      expect(result.compensated).toBe(1)
      expect(compensated).toEqual(['A'])
    })

    it('compensate throws -> swallowed + still proceed reverse compensation', async () => {
      const compensated: string[] = []
      const steps: SagaStep[] = [
        {
          name: 'A',
          run: async () => undefined,
          compensate: async () => void compensated.push('A')
        },
        {
          name: 'B',
          run: async () => undefined,
          compensate: async () => {
            throw new Error('compensate-fail')
          }
        },
        {
          name: 'C',
          run: async () => {
            throw new Error('boom')
          }
        }
      ]

      const result = await runner.execute('Saga1', buildEnvelope(), steps)
      expect(result.failedStep).toBe('C')
      expect(result.compensated).toBe(1) /* only A succeeded; B threw */
      expect(compensated).toEqual(['A'])
    })

    it('step without compensate -> not counted in compensated', async () => {
      const steps: SagaStep[] = [
        { name: 'A', run: async () => undefined },
        {
          name: 'B',
          run: async () => {
            throw new Error('boom')
          }
        }
      ]

      const result = await runner.execute('Saga1', buildEnvelope(), steps)
      expect(result.compensated).toBe(0)
      expect(dlqQueue.add).toHaveBeenCalled()
    })

    it('DLQ enqueue throws -> logged + result still returned', async () => {
      dlqQueue.add.mockRejectedValueOnce(new Error('queue-down'))
      const steps: SagaStep[] = [
        {
          name: 'A',
          run: async () => {
            throw new Error('boom')
          }
        }
      ]
      const result = await runner.execute('Saga1', buildEnvelope(), steps)
      expect(result.failedStep).toBe('A')
      expect(result.error).toBe('boom')
    })
  })

  describe('envelope payload sanitization', () => {
    it('non-JSON-safe body still survives DLQ enqueue (returns null body)', async () => {
      const circular: Record<string, unknown> = {}
      circular.self = circular
      const env = buildEnvelope('OrderPaid', circular)
      const steps: SagaStep[] = [
        {
          name: 'A',
          run: async () => {
            throw new Error('boom')
          }
        }
      ]
      await runner.execute('Saga1', env, steps)
      const job = dlqQueue.add.mock.calls[0]?.[1]
      expect(job).toBeDefined()
      expect((job as { body: unknown }).body).toBeNull()
    })
  })

  /* ==========================================================================
   * P9 Sprint 3 / W3.A.2 增补：持久化分支 + bootstrap 路径覆盖
   * 目标：branches 36.66% → ≥ 70%
   * ========================================================================== */

  describe('SagaStateService 持久化分支', () => {
    let runner2: SagaRunnerService
    let stateMock: SagaStateMock

    beforeEach(async () => {
      stateMock = {
        create: jest.fn().mockResolvedValue(undefined),
        load: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue(undefined),
        markCompleted: jest.fn().mockResolvedValue(undefined),
        markFailed: jest.fn().mockResolvedValue(undefined),
        findStuckSagas: jest.fn().mockResolvedValue([])
      }
      const dlq = { add: jest.fn().mockResolvedValue({ id: 'job-2' }) }
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          SagaRunnerService,
          { provide: getQueueToken(ORCHESTRATION_DLQ_QUEUE), useValue: dlq },
          { provide: SagaStateService, useValue: stateMock }
        ]
      }).compile()
      runner2 = moduleRef.get(SagaRunnerService)
    })

    it('全步成功 → create / load / save / markCompleted 各调用对应次数', async () => {
      const steps: SagaStep[] = [
        { name: 'S1', run: async () => undefined },
        { name: 'S2', run: async () => undefined }
      ]
      await runner2.execute('SagaWithState', buildEnvelope(), steps)
      expect(stateMock.create).toHaveBeenCalledTimes(1)
      expect(stateMock.load).toHaveBeenCalledTimes(2)
      expect(stateMock.save).toHaveBeenCalledTimes(2)
      expect(stateMock.markCompleted).toHaveBeenCalledTimes(1)
      expect(stateMock.markFailed).not.toHaveBeenCalled()
    })

    it('某步失败 → markFailed 被调用 + markCompleted 不调', async () => {
      const steps: SagaStep[] = [
        { name: 'S1', run: async () => undefined },
        {
          name: 'S2',
          run: async () => {
            throw new Error('boom-state')
          }
        }
      ]
      const r = await runner2.execute('SagaWithState', buildEnvelope(), steps)
      expect(r.failedStep).toBe('S2')
      expect(stateMock.markFailed).toHaveBeenCalledTimes(1)
      expect(stateMock.markFailed.mock.calls[0][1]).toBe('boom-state')
      expect(stateMock.markCompleted).not.toHaveBeenCalled()
    })

    it('create 抛错 → 仅 warn 不阻断 saga', async () => {
      stateMock.create.mockRejectedValueOnce(new Error('db-down-create'))
      const steps: SagaStep[] = [{ name: 'S1', run: async () => undefined }]
      const r = await runner2.execute('SagaCreateErr', buildEnvelope(), steps)
      expect(r.failedStep).toBeNull()
    })

    it('load 抛错 → 仅 warn 不阻断 saga', async () => {
      stateMock.load.mockRejectedValueOnce(new Error('db-down-load'))
      const steps: SagaStep[] = [{ name: 'S1', run: async () => undefined }]
      const r = await runner2.execute('SagaLoadErr', buildEnvelope(), steps)
      expect(r.failedStep).toBeNull()
    })

    it('save 抛错 → 仅 warn 不阻断 saga', async () => {
      stateMock.save.mockRejectedValueOnce(new Error('db-down-save'))
      const steps: SagaStep[] = [{ name: 'S1', run: async () => undefined }]
      const r = await runner2.execute('SagaSaveErr', buildEnvelope(), steps)
      expect(r.failedStep).toBeNull()
    })

    it('markCompleted 抛错 → 仅 warn 不影响返回值', async () => {
      stateMock.markCompleted.mockRejectedValueOnce(new Error('db-down-complete'))
      const steps: SagaStep[] = [{ name: 'S1', run: async () => undefined }]
      const r = await runner2.execute('SagaMarkCompletedErr', buildEnvelope(), steps)
      expect(r.failedStep).toBeNull()
    })

    it('markFailed 抛错 → 不冒泡，原 saga 失败结果照返', async () => {
      stateMock.markFailed.mockRejectedValueOnce(new Error('db-down-failed'))
      const steps: SagaStep[] = [
        {
          name: 'X',
          run: async () => {
            throw new Error('inner')
          }
        }
      ]
      const r = await runner2.execute('SagaMarkFailedErr', buildEnvelope(), steps)
      expect(r.failedStep).toBe('X')
      expect(r.error).toBe('inner')
    })

    it('persist 系列抛非 Error 值（string）→ String(err) 分支命中', async () => {
      stateMock.create.mockRejectedValueOnce('non-error-create')
      stateMock.load.mockRejectedValueOnce('non-error-load')
      stateMock.save.mockRejectedValueOnce('non-error-save')
      stateMock.markCompleted.mockRejectedValueOnce('non-error-complete')
      const steps: SagaStep[] = [{ name: 'P', run: async () => undefined }]
      const r = await runner2.execute('SagaNonErr', buildEnvelope(), steps)
      expect(r.failedStep).toBeNull()
    })

    it('step.run 抛非 Error 值 + markFailed 抛非 Error 值 → 双重 String 分支', async () => {
      stateMock.markFailed.mockRejectedValueOnce('non-error-failed')
      const steps: SagaStep[] = [
        {
          name: 'NEStep',
          run: async () => {
            throw 'plain-throw'
          }
        }
      ]
      const r = await runner2.execute('SagaNonErrStep', buildEnvelope(), steps)
      expect(r.failedStep).toBe('NEStep')
      expect(r.error).toBe('plain-throw')
    })
  })

  describe('onApplicationBootstrap', () => {
    it('SagaStateService 缺失 → 立即返回，无报错', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          SagaRunnerService,
          {
            provide: getQueueToken(ORCHESTRATION_DLQ_QUEUE),
            useValue: { add: jest.fn() }
          }
        ]
      }).compile()
      const r = moduleRef.get(SagaRunnerService)
      await expect(r.onApplicationBootstrap()).resolves.toBeUndefined()
    })

    it('findStuckSagas 返回 0 条 → log "无卡住 saga"', async () => {
      const stateMock: SagaStateMock = {
        create: jest.fn(),
        load: jest.fn(),
        save: jest.fn(),
        markCompleted: jest.fn(),
        markFailed: jest.fn(),
        findStuckSagas: jest.fn().mockResolvedValue([])
      }
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          SagaRunnerService,
          { provide: getQueueToken(ORCHESTRATION_DLQ_QUEUE), useValue: { add: jest.fn() } },
          { provide: SagaStateService, useValue: stateMock }
        ]
      }).compile()
      const r = moduleRef.get(SagaRunnerService)
      await r.onApplicationBootstrap()
      expect(stateMock.findStuckSagas).toHaveBeenCalled()
    })

    it('findStuckSagas 返回 N 条 → warn 列出 saga 信息', async () => {
      const stateMock: SagaStateMock = {
        create: jest.fn(),
        load: jest.fn(),
        save: jest.fn(),
        markCompleted: jest.fn(),
        markFailed: jest.fn(),
        findStuckSagas: jest.fn().mockResolvedValue([
          { sagaId: 'sg1', sagaType: 'OrderPaidSaga', stepIdx: 2 },
          { sagaId: 'sg2', sagaType: 'RefundSaga', stepIdx: 0 }
        ])
      }
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          SagaRunnerService,
          { provide: getQueueToken(ORCHESTRATION_DLQ_QUEUE), useValue: { add: jest.fn() } },
          { provide: SagaStateService, useValue: stateMock }
        ]
      }).compile()
      const r = moduleRef.get(SagaRunnerService)
      await r.onApplicationBootstrap()
      expect(stateMock.findStuckSagas).toHaveBeenCalled()
    })

    it('findStuckSagas 抛非 Error 值（string）→ String(err) 分支命中', async () => {
      const stateMock: SagaStateMock = {
        create: jest.fn(),
        load: jest.fn(),
        save: jest.fn(),
        markCompleted: jest.fn(),
        markFailed: jest.fn(),
        findStuckSagas: jest.fn().mockRejectedValue('plain-string-rejection')
      }
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          SagaRunnerService,
          { provide: getQueueToken(ORCHESTRATION_DLQ_QUEUE), useValue: { add: jest.fn() } },
          { provide: SagaStateService, useValue: stateMock }
        ]
      }).compile()
      const r = moduleRef.get(SagaRunnerService)
      await expect(r.onApplicationBootstrap()).resolves.toBeUndefined()
    })

    it('findStuckSagas 抛错 → 仅 warn 不冒泡', async () => {
      const stateMock: SagaStateMock = {
        create: jest.fn(),
        load: jest.fn(),
        save: jest.fn(),
        markCompleted: jest.fn(),
        markFailed: jest.fn(),
        findStuckSagas: jest.fn().mockRejectedValue(new Error('db not ready'))
      }
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          SagaRunnerService,
          { provide: getQueueToken(ORCHESTRATION_DLQ_QUEUE), useValue: { add: jest.fn() } },
          { provide: SagaStateService, useValue: stateMock }
        ]
      }).compile()
      const r = moduleRef.get(SagaRunnerService)
      await expect(r.onApplicationBootstrap()).resolves.toBeUndefined()
    })
  })
})
