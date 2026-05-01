/**
 * @file orchestration-dlq.processor.spec.ts
 * @stage P9 Sprint 6 / W6.A.2
 * @desc OrchestrationDlqProcessor 单测
 * @author Sprint 6 Agent A
 *
 * 关键覆盖：
 *   1) jobName != ORCHESTRATION_DLQ_JOB_NAME → logged=false（warn）
 *   2) 正常 job → logger.error + operation_log.write 被调
 *   3) operation_log 缺失（@Optional）→ 仍返回 logged=true
 *   4) operation_log.write 抛错 → 仅 warn 不冒泡
 *   5) attemptsMade 透传到 retryCount
 */

import { Test, type TestingModule } from '@nestjs/testing'
import type { Job } from 'bullmq'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import {
  EventSourceEnum,
  ORCHESTRATION_DLQ_JOB_NAME,
  type OrchestrationDlqJob
} from '../types/orchestration.types'
import { OrchestrationDlqProcessor } from './orchestration-dlq.processor'

interface OpLogMock {
  write: jest.Mock
}

const buildJobData = (override: Partial<OrchestrationDlqJob> = {}): OrchestrationDlqJob => ({
  sagaId: 'sg-001',
  sagaName: 'OrderPaidSaga',
  source: EventSourceEnum.ORDER,
  eventName: 'OrderPaid',
  body: { eventName: 'OrderPaid', orderNo: 'T1' },
  failedStep: 'CommitInventory',
  error: 'sku not found',
  executedSteps: [],
  failedAt: Date.now(),
  retryCount: 0,
  ...override
})

const buildJob = (
  override: Partial<OrchestrationDlqJob> = {},
  jobName: string = ORCHESTRATION_DLQ_JOB_NAME,
  attemptsMade = 0
): Job<OrchestrationDlqJob> =>
  ({
    name: jobName,
    data: buildJobData(override),
    attemptsMade
  }) as unknown as Job<OrchestrationDlqJob>

describe('OrchestrationDlqProcessor', () => {
  let processor: OrchestrationDlqProcessor
  let opLog: OpLogMock

  async function buildModule(opts: { withOpLog?: boolean } = {}) {
    opLog = { write: jest.fn().mockResolvedValue(undefined) }
    const providers: Parameters<typeof Test.createTestingModule>[0]['providers'] = [
      OrchestrationDlqProcessor
    ]
    if (opts.withOpLog !== false) {
      providers.push({ provide: OperationLogService, useValue: opLog })
    }
    const moduleRef: TestingModule = await Test.createTestingModule({ providers }).compile()
    processor = moduleRef.get(OrchestrationDlqProcessor)
  }

  it('jobName 错误 → logged=false 且不调 write', async () => {
    await buildModule()
    const r = await processor.process(buildJob({}, 'unknown-job'))
    expect(r.logged).toBe(false)
    expect(opLog.write).not.toHaveBeenCalled()
  })

  it('正常 job → logged=true + operation_log.write 被调', async () => {
    await buildModule()
    const r = await processor.process(buildJob({}, ORCHESTRATION_DLQ_JOB_NAME, 2))
    expect(r.logged).toBe(true)
    expect(opLog.write).toHaveBeenCalledTimes(1)
    const arg = opLog.write.mock.calls[0][0]
    expect(arg.opAdminId).toBe('system')
    expect(arg.module).toBe('orchestration')
    expect(arg.action).toBe('saga_failed')
    expect(arg.resourceType).toBe('saga')
    expect(arg.resourceId).toBe('sg-001')
    expect(arg.extra.retryCount).toBe(2) /* attemptsMade 透传 */
    expect(arg.extra.sagaName).toBe('OrderPaidSaga')
  })

  it('operation_log 缺失（@Optional）→ logged=true（不抛）', async () => {
    await buildModule({ withOpLog: false })
    const r = await processor.process(buildJob())
    expect(r.logged).toBe(true)
  })

  it('operation_log.write 抛错 → 仅 warn 不冒泡 + 仍 logged=true', async () => {
    await buildModule()
    opLog.write.mockRejectedValueOnce(new Error('db down'))
    const r = await processor.process(buildJob())
    expect(r.logged).toBe(true)
  })

  it('source/eventName/body 等字段都透传到 extra', async () => {
    await buildModule()
    await processor.process(
      buildJob({
        source: EventSourceEnum.PAYMENT,
        eventName: 'PaymentSucceed',
        body: { eventName: 'PaymentSucceed', payNo: 'P1' },
        executedSteps: ['StepA', 'StepB']
      })
    )
    const extra = opLog.write.mock.calls[0][0].extra
    expect(extra.source).toBe(EventSourceEnum.PAYMENT)
    expect(extra.eventName).toBe('PaymentSucceed')
    expect(extra.executedSteps).toEqual(['StepA', 'StepB'])
    expect(extra.body).toEqual({ eventName: 'PaymentSucceed', payNo: 'P1' })
  })
})
