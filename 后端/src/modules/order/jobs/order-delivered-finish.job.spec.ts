/**
 * @file order-delivered-finish.job.spec.ts
 * @stage P9 Sprint 2 / W2.B.1（P9-P1-04）
 * @desc OrderDeliveredFinishJob 单测
 * @author 单 Agent V2.0（Sprint 2 Agent B）
 *
 * 关键覆盖：
 *   1) scheduleAutoFinish：合法 orderNo → queue.add 调用 + 参数校验
 *   2) scheduleAutoFinish：非法 orderNo → 跳过 + 不调 queue.add
 *   3) scheduleAutoFinish：queue.add 抛错 → 仅 log，不抛
 *   4) process：status=50 DELIVERED → transit('OrderFinished') 成功
 *   5) process：status=55 FINISHED → 跳过
 *   6) process：status=60 CANCELED → 跳过
 *   7) process：getCurrentStatus 抛错（订单不存在）→ skipped + reason=order_not_found
 *   8) process：transit 抛错 → skipped + reason=transit_failed
 *   9) process：缺 orderNo / orderType → skipped + reason=invalid_payload
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { OrderStateMachine } from '../state-machine/order-state-machine'
import { OrderTakeoutStatusEnum, OrderTypeEnum } from '../types/order.types'
import {
  ORDER_DELIVERED_FINISH_DELAY_MS,
  ORDER_DELIVERED_FINISH_JOB_NAME,
  ORDER_DELIVERED_FINISH_QUEUE,
  OrderDeliveredFinishJob,
  type OrderDeliveredFinishJobPayload
} from './order-delivered-finish.job'

interface QueueMock {
  add: jest.Mock
}

interface StateMachineMock {
  getCurrentStatus: jest.Mock
  transit: jest.Mock
}

describe('OrderDeliveredFinishJob', () => {
  let job: OrderDeliveredFinishJob
  let queue: QueueMock
  let stateMachine: StateMachineMock

  const VALID_ORDER_NO = 'T20260501010000001'

  const mkJob = (
    payload: Partial<OrderDeliveredFinishJobPayload>
  ): Job<OrderDeliveredFinishJobPayload> =>
    ({
      id: 'job-1',
      data: payload as OrderDeliveredFinishJobPayload
    }) as unknown as Job<OrderDeliveredFinishJobPayload>

  beforeEach(async () => {
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) }
    stateMachine = {
      getCurrentStatus: jest.fn(),
      transit: jest.fn()
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OrderDeliveredFinishJob,
        { provide: getQueueToken(ORDER_DELIVERED_FINISH_QUEUE), useValue: queue },
        { provide: OrderStateMachine, useValue: stateMachine }
      ]
    }).compile()

    job = moduleRef.get(OrderDeliveredFinishJob)
  })

  /* ==========================================================================
   * scheduleAutoFinish
   * ========================================================================== */

  describe('scheduleAutoFinish', () => {
    it('合法 orderNo → queue.add 入队', async () => {
      await job.scheduleAutoFinish(VALID_ORDER_NO, OrderTypeEnum.TAKEOUT)
      expect(queue.add).toHaveBeenCalledTimes(1)
      const [name, payload, opts] = queue.add.mock.calls[0]
      expect(name).toBe(ORDER_DELIVERED_FINISH_JOB_NAME)
      expect(payload).toEqual({ orderNo: VALID_ORDER_NO, orderType: OrderTypeEnum.TAKEOUT })
      expect(opts.delay).toBe(ORDER_DELIVERED_FINISH_DELAY_MS)
      expect(opts.jobId).toBe(`auto-finish:${VALID_ORDER_NO}`)
      expect(opts.attempts).toBe(1)
    })

    it('非法 orderNo（长度不足）→ 跳过 + 不入队', async () => {
      await job.scheduleAutoFinish('SHORT', OrderTypeEnum.TAKEOUT)
      expect(queue.add).not.toHaveBeenCalled()
    })

    it('空 orderNo → 跳过 + 不入队', async () => {
      await job.scheduleAutoFinish('', OrderTypeEnum.TAKEOUT)
      expect(queue.add).not.toHaveBeenCalled()
    })

    it('queue.add 抛错 → 仅 log，不抛', async () => {
      queue.add.mockRejectedValueOnce(new Error('redis-down'))
      await expect(
        job.scheduleAutoFinish(VALID_ORDER_NO, OrderTypeEnum.TAKEOUT)
      ).resolves.toBeUndefined()
    })

    it('跑腿订单同样可调度', async () => {
      await job.scheduleAutoFinish(VALID_ORDER_NO, OrderTypeEnum.ERRAND)
      const [, payload] = queue.add.mock.calls[0]
      expect(payload.orderType).toBe(OrderTypeEnum.ERRAND)
    })
  })

  /* ==========================================================================
   * process
   * ========================================================================== */

  describe('process', () => {
    it('status=DELIVERED(50) → transit(OrderFinished) 成功 → 返回 finished=true', async () => {
      stateMachine.getCurrentStatus.mockResolvedValueOnce(OrderTakeoutStatusEnum.DELIVERED)
      stateMachine.transit.mockResolvedValueOnce({
        orderNo: VALID_ORDER_NO,
        orderType: OrderTypeEnum.TAKEOUT,
        event: 'OrderFinished',
        fromStatus: 50,
        toStatus: 55,
        statusLogId: 'LOG-1',
        occurredAt: Date.now()
      })

      const result = await job.process(
        mkJob({ orderNo: VALID_ORDER_NO, orderType: OrderTypeEnum.TAKEOUT })
      )

      expect(stateMachine.getCurrentStatus).toHaveBeenCalledWith(
        VALID_ORDER_NO,
        OrderTypeEnum.TAKEOUT
      )
      expect(stateMachine.transit).toHaveBeenCalledTimes(1)
      const [orderNoArg, orderTypeArg, eventArg, ctx] = stateMachine.transit.mock.calls[0]
      expect(orderNoArg).toBe(VALID_ORDER_NO)
      expect(orderTypeArg).toBe(OrderTypeEnum.TAKEOUT)
      expect(eventArg).toBe('OrderFinished')
      expect(ctx.opType).toBeDefined()
      expect(ctx.additionalFields.finishedAt).toBeInstanceOf(Date)
      expect(result).toEqual({ finished: true })
    })

    it('status=FINISHED(55) 已确认 → 跳过', async () => {
      stateMachine.getCurrentStatus.mockResolvedValueOnce(OrderTakeoutStatusEnum.FINISHED)
      const result = await job.process(
        mkJob({ orderNo: VALID_ORDER_NO, orderType: OrderTypeEnum.TAKEOUT })
      )
      expect(stateMachine.transit).not.toHaveBeenCalled()
      expect(result.skipped).toBe(true)
      expect(result.reason).toContain('status_55')
    })

    it('status=CANCELED(60) → 跳过', async () => {
      stateMachine.getCurrentStatus.mockResolvedValueOnce(OrderTakeoutStatusEnum.CANCELED)
      const result = await job.process(
        mkJob({ orderNo: VALID_ORDER_NO, orderType: OrderTypeEnum.TAKEOUT })
      )
      expect(stateMachine.transit).not.toHaveBeenCalled()
      expect(result.skipped).toBe(true)
      expect(result.reason).toContain('status_60')
    })

    it('status=AFTER_SALE(70) → 跳过', async () => {
      stateMachine.getCurrentStatus.mockResolvedValueOnce(OrderTakeoutStatusEnum.AFTER_SALE)
      const result = await job.process(
        mkJob({ orderNo: VALID_ORDER_NO, orderType: OrderTypeEnum.TAKEOUT })
      )
      expect(stateMachine.transit).not.toHaveBeenCalled()
      expect(result.skipped).toBe(true)
    })

    it('订单不存在（getCurrentStatus 抛错）→ skipped + reason=order_not_found', async () => {
      stateMachine.getCurrentStatus.mockRejectedValueOnce(new Error('订单 X 不存在'))
      const result = await job.process(
        mkJob({ orderNo: VALID_ORDER_NO, orderType: OrderTypeEnum.TAKEOUT })
      )
      expect(stateMachine.transit).not.toHaveBeenCalled()
      expect(result).toEqual({ skipped: true, reason: 'order_not_found' })
    })

    it('transit 抛错 → skipped + reason=transit_failed（不抛）', async () => {
      stateMachine.getCurrentStatus.mockResolvedValueOnce(OrderTakeoutStatusEnum.DELIVERED)
      stateMachine.transit.mockRejectedValueOnce(new Error('CAS 冲突'))
      const result = await job.process(
        mkJob({ orderNo: VALID_ORDER_NO, orderType: OrderTypeEnum.TAKEOUT })
      )
      expect(result).toEqual({ skipped: true, reason: 'transit_failed' })
    })

    it('payload 缺 orderNo → skipped + reason=invalid_payload', async () => {
      const result = await job.process(mkJob({ orderType: OrderTypeEnum.TAKEOUT }))
      expect(stateMachine.getCurrentStatus).not.toHaveBeenCalled()
      expect(result).toEqual({ skipped: true, reason: 'invalid_payload' })
    })

    it('payload 缺 orderType → skipped + reason=invalid_payload', async () => {
      const result = await job.process(mkJob({ orderNo: VALID_ORDER_NO }))
      expect(stateMachine.getCurrentStatus).not.toHaveBeenCalled()
      expect(result).toEqual({ skipped: true, reason: 'invalid_payload' })
    })
  })
})
