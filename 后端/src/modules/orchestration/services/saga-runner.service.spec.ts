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

interface QueueMock {
  add: jest.Mock
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
})
