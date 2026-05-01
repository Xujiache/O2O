/**
 * @file dlq-retry.processor.spec.ts
 * @stage P9 Sprint 5 / W5.A.2
 * @desc DlqRetryProcessor 单测：真路由 publish + branches 复核
 * @author Sprint 5 Agent A
 *
 * 关键覆盖：
 *   1) jobName != DLQ_RETRY_JOB_NAME → SKIPPED
 *   2) logRepo 缺失 → SKIPPED
 *   3) entity 已 RETRY_OK / DISCARDED → SKIPPED
 *   4) source='order' + orderPublisher 存在 + body 合法 → publish 真发生 + status=RETRY_OK
 *   5) source='payment' + paymentPublisher 存在 + body 合法 → publish 真发生 + status=RETRY_OK
 *   6) source='order' + orderPublisher 缺失 → NO_PUBLISHER → status=PENDING
 *   7) source='cron' / 'manual' → UNSUPPORTED → status=PENDING
 *   8) body 不合法（缺 eventName/orderNo/payNo）→ INVALID_BODY → status=PENDING
 *   9) publish 抛错 → PUBLISH_FAILED → status=PENDING
 *  10) 4 次重试 → status=PERMANENT_FAILED + 不调 publish
 *  11) enqueueRetry happy + retryQueue 缺失场景
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { Job } from 'bullmq'
import { DlqRetryLog, DlqRetryLogStatusEnum } from '@/entities'
import { ORDER_EVENTS_PUBLISHER } from '@/modules/order/events/order-events.constants'
import { PAYMENT_EVENTS_PUBLISHER } from '@/modules/payment/services/payment-events.publisher'
import { EventSourceEnum, type OrchestrationDlqJob } from '../types/orchestration.types'
import {
  DLQ_RETRY_JOB_NAME,
  DlqRetryProcessor,
  ORCHESTRATION_DLQ_RETRY_QUEUE
} from './dlq-retry.processor'

interface RepoMock {
  findOne: jest.Mock
  create: jest.Mock
  save: jest.Mock
}

interface PublisherMock {
  publish: jest.Mock
}

interface QueueMock {
  add: jest.Mock
}

const buildJobData = (override: Partial<OrchestrationDlqJob> = {}): OrchestrationDlqJob => ({
  sagaId: 'sg-001',
  sagaName: 'OrderPaidSaga',
  source: EventSourceEnum.ORDER,
  eventName: 'OrderPaid',
  body: { eventName: 'OrderPaid', orderNo: 'T20260501000001' },
  failedStep: 'CommitInventory',
  error: 'sku not found',
  executedSteps: [],
  failedAt: Date.now(),
  retryCount: 0,
  ...override
})

const buildJob = (
  override: Partial<OrchestrationDlqJob> = {},
  jobName: string = DLQ_RETRY_JOB_NAME
): Job<OrchestrationDlqJob> =>
  ({
    name: jobName,
    data: buildJobData(override)
  }) as unknown as Job<OrchestrationDlqJob>

describe('DlqRetryProcessor', () => {
  let processor: DlqRetryProcessor
  let logRepo: RepoMock
  let orderPub: PublisherMock
  let paymentPub: PublisherMock
  let retryQueue: QueueMock

  async function buildModule(opts: {
    withLogRepo?: boolean
    withOrderPub?: boolean
    withPaymentPub?: boolean
    withRetryQueue?: boolean
  }) {
    logRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: Record<string, unknown>) => d),
      save: jest.fn(async (e: unknown) => e)
    }
    orderPub = { publish: jest.fn().mockResolvedValue(undefined) }
    paymentPub = { publish: jest.fn().mockResolvedValue(undefined) }
    retryQueue = { add: jest.fn().mockResolvedValue({ id: 'q-1' }) }

    const providers: Parameters<typeof Test.createTestingModule>[0]['providers'] = [
      DlqRetryProcessor
    ]
    if (opts.withLogRepo !== false) {
      providers.push({ provide: getRepositoryToken(DlqRetryLog), useValue: logRepo })
    }
    if (opts.withOrderPub !== false) {
      providers.push({ provide: ORDER_EVENTS_PUBLISHER, useValue: orderPub })
    }
    if (opts.withPaymentPub !== false) {
      providers.push({ provide: PAYMENT_EVENTS_PUBLISHER, useValue: paymentPub })
    }
    if (opts.withRetryQueue !== false) {
      providers.push({
        provide: getQueueToken(ORCHESTRATION_DLQ_RETRY_QUEUE),
        useValue: retryQueue
      })
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers
    }).compile()
    processor = moduleRef.get(DlqRetryProcessor)
  }

  describe('skip 路径', () => {
    it('jobName != DLQ_RETRY_JOB_NAME → SKIPPED', async () => {
      await buildModule({})
      const r = await processor.process(buildJob({}, 'other-job'))
      expect(r.status).toBe('SKIPPED')
      expect(logRepo.save).not.toHaveBeenCalled()
    })

    it('logRepo 缺失 → SKIPPED', async () => {
      await buildModule({ withLogRepo: false })
      const r = await processor.process(buildJob())
      expect(r.status).toBe('SKIPPED')
    })

    it('entity 已 RETRY_OK → SKIPPED（幂等）', async () => {
      await buildModule({})
      logRepo.findOne.mockResolvedValueOnce({
        sagaId: 'sg-001',
        retryCount: 1,
        status: DlqRetryLogStatusEnum.RETRY_OK
      })
      const r = await processor.process(buildJob())
      expect(r.status).toBe('SKIPPED')
      expect(orderPub.publish).not.toHaveBeenCalled()
    })

    it('entity 已 DISCARDED → SKIPPED', async () => {
      await buildModule({})
      logRepo.findOne.mockResolvedValueOnce({
        sagaId: 'sg-001',
        retryCount: 1,
        status: DlqRetryLogStatusEnum.DISCARDED
      })
      const r = await processor.process(buildJob())
      expect(r.status).toBe('SKIPPED')
    })
  })

  describe('真路由 publish 复核', () => {
    it('source=order + orderPublisher 存在 + body 合法 → publish 真发生 + status=RETRY_OK', async () => {
      await buildModule({})
      const r = await processor.process(buildJob())
      expect(orderPub.publish).toHaveBeenCalledTimes(1)
      expect(orderPub.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'OrderPaid', orderNo: 'T20260501000001' })
      )
      expect(r.status).toBe('RETRY_OK')
      /* save 第二次（mark RETRY_OK） */
      expect(logRepo.save).toHaveBeenCalledTimes(2)
    })

    it('source=payment + paymentPublisher 存在 + body 合法 → publish 真发生', async () => {
      await buildModule({})
      const r = await processor.process(
        buildJob({
          source: EventSourceEnum.PAYMENT,
          eventName: 'PaymentSucceed',
          body: { eventName: 'PaymentSucceed', payNo: 'P20260501000001' }
        })
      )
      expect(paymentPub.publish).toHaveBeenCalledTimes(1)
      expect(paymentPub.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'PaymentSucceed', payNo: 'P20260501000001' })
      )
      expect(r.status).toBe('RETRY_OK')
    })

    it('source=order + orderPublisher 缺失 → NO_PUBLISHER → PENDING（不抛）', async () => {
      await buildModule({ withOrderPub: false })
      const r = await processor.process(buildJob())
      expect(r.status).toBe('PENDING')
    })

    it('source=cron → UNSUPPORTED → PENDING', async () => {
      await buildModule({})
      const r = await processor.process(buildJob({ source: EventSourceEnum.CRON }))
      expect(orderPub.publish).not.toHaveBeenCalled()
      expect(paymentPub.publish).not.toHaveBeenCalled()
      expect(r.status).toBe('PENDING')
    })

    it('source=manual → UNSUPPORTED → PENDING', async () => {
      await buildModule({})
      const r = await processor.process(buildJob({ source: EventSourceEnum.MANUAL }))
      expect(r.status).toBe('PENDING')
    })

    it('order body 缺 orderNo → INVALID_BODY → PENDING', async () => {
      await buildModule({})
      const r = await processor.process(buildJob({ body: { eventName: 'OrderPaid' } as never }))
      expect(orderPub.publish).not.toHaveBeenCalled()
      expect(r.status).toBe('PENDING')
    })

    it('payment body 缺 payNo → INVALID_BODY → PENDING', async () => {
      await buildModule({})
      const r = await processor.process(
        buildJob({
          source: EventSourceEnum.PAYMENT,
          body: { eventName: 'PaymentSucceed' } as never
        })
      )
      expect(paymentPub.publish).not.toHaveBeenCalled()
      expect(r.status).toBe('PENDING')
    })

    it('publish 抛错 → PUBLISH_FAILED → PENDING（不冒泡）', async () => {
      await buildModule({})
      orderPub.publish.mockRejectedValueOnce(new Error('mq down'))
      const r = await processor.process(buildJob())
      expect(r.status).toBe('PENDING')
    })
  })

  describe('PERMANENT_FAILED', () => {
    it('第 4 次重试（已 retryCount=3）→ PERMANENT_FAILED + 不调 publish', async () => {
      await buildModule({})
      logRepo.findOne.mockResolvedValueOnce({
        sagaId: 'sg-001',
        retryCount: 3,
        status: DlqRetryLogStatusEnum.PENDING,
        nextRetryAt: null
      })
      const r = await processor.process(buildJob({ retryCount: 3 }))
      expect(r.status).toBe('PERMANENT_FAILED')
      expect(orderPub.publish).not.toHaveBeenCalled()
    })
  })

  describe('enqueueRetry', () => {
    it('happy → 投递成功 true', async () => {
      await buildModule({})
      const ok = await processor.enqueueRetry(buildJobData())
      expect(ok).toBe(true)
      expect(retryQueue.add).toHaveBeenCalledTimes(1)
    })

    it('retryQueue 缺失 → false + warn', async () => {
      await buildModule({ withRetryQueue: false })
      const ok = await processor.enqueueRetry(buildJobData())
      expect(ok).toBe(false)
    })

    it('retryQueue.add 抛错 → false + 不冒泡', async () => {
      await buildModule({})
      retryQueue.add.mockRejectedValueOnce(new Error('queue down'))
      const ok = await processor.enqueueRetry(buildJobData())
      expect(ok).toBe(false)
    })
  })

  describe('save 失败容错', () => {
    it('logRepo.save 抛错 → SKIPPED + 不冒泡', async () => {
      await buildModule({})
      logRepo.save.mockRejectedValueOnce(new Error('db gone away'))
      const r = await processor.process(buildJob())
      expect(r.status).toBe('SKIPPED')
    })
  })
})
