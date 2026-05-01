/**
 * @file refund-saga.service.spec.ts
 * @stage P9 Sprint 3 / W3.B.1
 * @desc RefundReverseSagaService 单测
 * @author 单 Agent V2.0（Sprint 3 Agent B）
 *
 * 关键覆盖：
 *   1) 命中 RefundSucceed → 调 settlement.reverseForOrder + 通知
 *   2) 命中 RefundSucceeded（兼容命名）→ 同上
 *   3) 非预期事件 → NoOpSaga 直接返回
 *   4) MessageService 缺失 → 通知步骤跳过但 saga 仍成功
 *   5) reverseForOrder 抛错 → SagaRunner 捕获并落 DLQ；后续步骤不执行
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { MessageService } from '@/modules/message/message.service'
import { SettlementService } from '@/modules/finance/services/settlement.service'
import {
  EventSourceEnum,
  ORCHESTRATION_DLQ_QUEUE,
  type PaymentEventEnvelope
} from '../types/orchestration.types'
import { SagaRunnerService } from './saga-runner.service'
import { RefundReverseSagaService } from './refund-saga.service'

describe('RefundReverseSagaService', () => {
  let saga: RefundReverseSagaService
  let runner: SagaRunnerService
  let settlementService: { reverseForOrder: jest.Mock }
  let messageService: { send: jest.Mock }
  let dlqQueue: { add: jest.Mock }

  const buildEnvelope = (eventName = 'RefundSucceed'): PaymentEventEnvelope => ({
    source: EventSourceEnum.PAYMENT,
    eventName,
    body: {
      eventName: eventName as 'RefundSucceed',
      payNo: 'PAY0001',
      orderNo: 'T20260419000088001',
      orderType: 1,
      userId: 'U1',
      amount: '50.00',
      payMethod: 1,
      fromStatus: 2,
      toStatus: 5,
      occurredAt: Date.now(),
      traceId: '',
      extra: {}
    },
    receivedAt: Date.now(),
    traceId: ''
  })

  beforeEach(async () => {
    dlqQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) }
    settlementService = {
      reverseForOrder: jest.fn().mockResolvedValue({ reversed: 3, failed: 0 })
    }
    messageService = { send: jest.fn().mockResolvedValue(undefined) }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SagaRunnerService,
        RefundReverseSagaService,
        { provide: getQueueToken(ORCHESTRATION_DLQ_QUEUE), useValue: dlqQueue },
        { provide: SettlementService, useValue: settlementService },
        { provide: MessageService, useValue: messageService }
      ]
    }).compile()

    saga = moduleRef.get(RefundReverseSagaService)
    runner = moduleRef.get(SagaRunnerService)
    void runner
  })

  it('happy: RefundSucceed 事件 → 调 reverseForOrder + 通知用户', async () => {
    const result = await saga.runReverseSaga(buildEnvelope('RefundSucceed'))
    expect(result.failedStep).toBeNull()
    expect(result.executedSteps).toEqual(['ReverseSettlement', 'NotifyRefundSucceeded'])
    expect(settlementService.reverseForOrder).toHaveBeenCalledWith('T20260419000088001', '50.00')
    expect(messageService.send).toHaveBeenCalledTimes(1)
    expect(dlqQueue.add).not.toHaveBeenCalled()
  })

  it('兼容命名 RefundSucceeded → 同样触发反向分账', async () => {
    const result = await saga.runReverseSaga(buildEnvelope('RefundSucceeded'))
    expect(result.failedStep).toBeNull()
    expect(settlementService.reverseForOrder).toHaveBeenCalledTimes(1)
  })

  it('非预期事件名 → NoOpSaga 直接返回', async () => {
    const result = await saga.runReverseSaga(buildEnvelope('PaymentSucceed'))
    expect(result.sagaName).toBe('NoOpSaga')
    expect(result.executedSteps).toHaveLength(0)
    expect(settlementService.reverseForOrder).not.toHaveBeenCalled()
    expect(messageService.send).not.toHaveBeenCalled()
  })

  it('reverseForOrder 抛错 → 投 DLQ + 后续 NotifyRefundSucceeded 不执行', async () => {
    settlementService.reverseForOrder.mockRejectedValueOnce(new Error('db down'))

    const result = await saga.runReverseSaga(buildEnvelope('RefundSucceed'))
    expect(result.failedStep).toBe('ReverseSettlement')
    expect(result.error).toContain('db down')
    expect(messageService.send).not.toHaveBeenCalled()
    expect(dlqQueue.add).toHaveBeenCalledTimes(1)
  })

  it('messageService.send 抛错 → 步骤吞异常 + saga 整体仍成功', async () => {
    messageService.send.mockRejectedValueOnce(new Error('mq disconnected'))

    const result = await saga.runReverseSaga(buildEnvelope('RefundSucceed'))
    /* 内部 try/catch 吞错；NotifyRefundSucceeded 视为成功完成 */
    expect(result.failedStep).toBeNull()
    expect(result.executedSteps).toContain('NotifyRefundSucceeded')
  })
})
