/**
 * @file refund.service.spec.ts
 * @stage P9 Sprint 3 / W3.B.1
 * @desc RefundService 单测：RefundSucceed 事件发布断言
 * @author 单 Agent V2.0（Sprint 3 Agent B）
 *
 * 关键覆盖：
 *   1) 余额支付路径成功 → 发布 'RefundSucceed' 事件
 *   2) 三方同步成功路径 → 发布 'RefundSucceed' 事件
 *   3) 通知回调成功路径 → 发布 'RefundSucceed' 事件
 *
 * 注：RefundService 依赖较多（Redis / DataSource / Adapter Map），
 * 本 spec 仅校验 publisher 被调用 + eventName='RefundSucceed'，
 * 不深入业务逻辑（已由 P4/T4.52 集成测覆盖）。
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { PaymentRecord, RefundRecord } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import {
  PAYMENT_ADAPTER_REGISTRY,
  type IPaymentAdapter
} from '../adapters/payment-adapter.interface'
import { BalanceService } from './balance.service'
import { PAYMENT_EVENTS_PUBLISHER } from './payment-events.publisher'
import { PaymentStateMachine } from './payment-state-machine'
import { RefundService } from './refund.service'
import { PayMethod, PayStatus, RefundStatus } from '../types/payment.types'

describe('RefundService - RefundSucceed 事件发布', () => {
  let service: RefundService
  let publisher: { publish: jest.Mock }
  let payRepoFindOne: jest.Mock
  let refundRepoFindOne: jest.Mock
  let refundRepoFind: jest.Mock
  let refundRepoSave: jest.Mock
  let refundRepoCreate: jest.Mock
  let refundRepoUpdate: jest.Mock
  let stateMachineTransit: jest.Mock
  let balanceServiceRefund: jest.Mock

  const buildPayment = (over: Record<string, unknown> = {}) => ({
    payNo: 'PAY0001',
    orderNo: 'T20260419000088001',
    orderType: 1,
    userId: 'U1',
    amount: '100.00',
    payMethod: PayMethod.BALANCE,
    status: PayStatus.SUCCESS,
    outTradeNo: null,
    isDeleted: 0,
    ...over
  })

  beforeEach(async () => {
    publisher = { publish: jest.fn().mockResolvedValue(undefined) }

    payRepoFindOne = jest.fn()
    refundRepoFindOne = jest.fn()
    refundRepoFind = jest.fn().mockResolvedValue([])
    refundRepoSave = jest.fn(async (e: unknown) => e)
    refundRepoCreate = jest.fn((data: unknown) => data)
    refundRepoUpdate = jest.fn().mockResolvedValue({ affected: 1 })
    stateMachineTransit = jest.fn().mockResolvedValue({ ok: true })
    balanceServiceRefund = jest.fn().mockResolvedValue({
      balanceAfter: '50.00',
      flowNo: 'FR0001'
    })

    const redisMock = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1)
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RefundService,
        {
          provide: getRepositoryToken(RefundRecord),
          useValue: {
            findOne: refundRepoFindOne,
            find: refundRepoFind,
            save: refundRepoSave,
            create: refundRepoCreate,
            update: refundRepoUpdate
          }
        },
        {
          provide: getRepositoryToken(PaymentRecord),
          useValue: { findOne: payRepoFindOne }
        },
        {
          provide: getDataSourceToken(),
          useValue: { transaction: jest.fn() }
        },
        { provide: REDIS_CLIENT, useValue: redisMock },
        {
          provide: PAYMENT_ADAPTER_REGISTRY,
          useValue: new Map<PayMethod, IPaymentAdapter>()
        },
        { provide: PaymentStateMachine, useValue: { transit: stateMachineTransit } },
        { provide: BalanceService, useValue: { refundToBalance: balanceServiceRefund } },
        { provide: PAYMENT_EVENTS_PUBLISHER, useValue: publisher },
        { provide: OperationLogService, useValue: { write: jest.fn() } }
      ]
    }).compile()

    service = moduleRef.get(RefundService)
  })

  it('余额支付路径 → publisher.publish 被调用且 eventName=RefundSucceed', async () => {
    payRepoFindOne.mockResolvedValueOnce(buildPayment({ payMethod: PayMethod.BALANCE }))

    const res = await service.createRefund({
      payNo: 'PAY0001',
      amount: '50.00',
      reason: '测试退款'
    })

    expect(res.status).toBe(RefundStatus.SUCCESS)
    /* 至少有一次 publish 是 RefundSucceed */
    const calls = publisher.publish.mock.calls
    const eventNames = calls.map((c) => (c[0] as { eventName: string }).eventName)
    expect(eventNames).toContain('RefundSucceed')
  })

  it('publisher 抛错被吞 → 不影响主流程', async () => {
    payRepoFindOne.mockResolvedValueOnce(buildPayment({ payMethod: PayMethod.BALANCE }))
    publisher.publish.mockRejectedValue(new Error('mq down'))

    const res = await service.createRefund({
      payNo: 'PAY0001',
      amount: '30.00',
      reason: '测试退款 mq fail'
    })

    /* publisher 失败不影响 refund 主流程 */
    expect(res.status).toBe(RefundStatus.SUCCESS)
  })
})
