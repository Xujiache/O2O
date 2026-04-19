/**
 * @file payment-state-machine.spec.ts
 * @stage P4/T4.52（Sprint 8）
 * @desc PaymentStateMachine 单测：状态变迁矩阵 + 锁失败 + 幂等
 * @author 单 Agent V2.0（Subagent 7）
 *
 * 关键覆盖：
 *   1) 0 → 2 SUCCESS（PaymentSucceed）成功 + 发事件
 *   2) 2 → 5 REFUNDED（RefundSucceed）成功
 *   3) 0 → 4 CLOSED（PaymentClosed）成功
 *   4) 0 → 5 不允许 → 抛 BIZ_ORDER_STATE_NOT_ALLOWED
 *   5) 锁失败 → 抛 BIZ_DATA_CONFLICT
 *   6) 重复 PaymentSucceed → idempotent=true（不重复发事件）
 *   7) payment_record 不存在 → 抛 BIZ_RESOURCE_NOT_FOUND
 *   8) PaymentCreated（target=null）→ 抛 BIZ_STATE_INVALID
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import { BizErrorCode } from '@/common'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { PAYMENT_EVENTS_PUBLISHER } from './payment-events.publisher'
import { PaymentStateMachine } from './payment-state-machine'
import { PayMethod, PayStatus } from '../types/payment.types'

interface RedisMock {
  set: jest.Mock
  eval: jest.Mock
}

interface QueryRunnerMock {
  connect: jest.Mock
  startTransaction: jest.Mock
  commitTransaction: jest.Mock
  rollbackTransaction: jest.Mock
  release: jest.Mock
  isTransactionActive: boolean
  manager: {
    getRepository: jest.Mock
  }
}

describe('PaymentStateMachine', () => {
  let stateMachine: PaymentStateMachine
  let redis: RedisMock
  let publisher: { publish: jest.Mock }
  let queryRunner: QueryRunnerMock
  let repoFindOne: jest.Mock
  let repoSave: jest.Mock

  /** Build a default payment record */
  const buildPayment = (over: Record<string, unknown> = {}) => ({
    payNo: 'PAY0001',
    orderNo: 'T20260419000001234',
    orderType: 1,
    userId: 'U1',
    amount: '50.00',
    payMethod: PayMethod.WX_PAY,
    status: PayStatus.CREATED,
    payAt: null,
    outTradeNo: null,
    rawResponse: null,
    errorCode: null,
    errorMsg: null,
    isDeleted: 0,
    ...over
  })

  beforeEach(async () => {
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1)
    }
    publisher = { publish: jest.fn().mockResolvedValue(undefined) }

    repoFindOne = jest.fn()
    repoSave = jest.fn(async (entity: unknown) => entity)

    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
      manager: {
        getRepository: jest.fn().mockReturnValue({ findOne: repoFindOne, save: repoSave })
      }
    }

    const fakeDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner)
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentStateMachine,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getDataSourceToken(), useValue: fakeDataSource },
        { provide: PAYMENT_EVENTS_PUBLISHER, useValue: publisher }
      ]
    }).compile()

    stateMachine = moduleRef.get(PaymentStateMachine)
  })

  describe('lock', () => {
    it('SET NX failed -> throws BIZ_DATA_CONFLICT', async () => {
      redis.set.mockResolvedValueOnce(null)
      await expect(stateMachine.transit('PAY0001', 'PaymentSucceed')).rejects.toMatchObject({
        bizCode: BizErrorCode.BIZ_DATA_CONFLICT
      })
    })
  })

  describe('transitions', () => {
    it('CREATED -> SUCCESS commits + publishes event', async () => {
      repoFindOne.mockResolvedValueOnce(buildPayment({ status: PayStatus.CREATED }))

      const result = await stateMachine.transit('PAY0001', 'PaymentSucceed', {
        outTradeNo: 'TX001',
        paidAt: Date.now()
      })

      expect(result.from).toBe(PayStatus.CREATED)
      expect(result.to).toBe(PayStatus.SUCCESS)
      expect(result.idempotent).toBe(false)
      expect(publisher.publish).toHaveBeenCalledTimes(1)
      expect(publisher.publish.mock.calls[0]?.[0]).toMatchObject({
        eventName: 'PaymentSucceed',
        toStatus: PayStatus.SUCCESS
      })
    })

    it('SUCCESS -> REFUNDED commits + publishes RefundSucceed', async () => {
      repoFindOne.mockResolvedValueOnce(buildPayment({ status: PayStatus.SUCCESS }))

      const result = await stateMachine.transit('PAY0001', 'RefundSucceed')

      expect(result.from).toBe(PayStatus.SUCCESS)
      expect(result.to).toBe(PayStatus.REFUNDED)
      expect(publisher.publish).toHaveBeenCalledTimes(1)
    })

    it('CREATED -> CLOSED via PaymentClosed', async () => {
      repoFindOne.mockResolvedValueOnce(buildPayment({ status: PayStatus.CREATED }))

      const result = await stateMachine.transit('PAY0001', 'PaymentClosed')
      expect(result.from).toBe(PayStatus.CREATED)
      expect(result.to).toBe(PayStatus.CLOSED)
    })

    it('CREATED -> REFUNDED disallowed -> throws BIZ_ORDER_STATE_NOT_ALLOWED', async () => {
      repoFindOne.mockResolvedValueOnce(buildPayment({ status: PayStatus.CREATED }))

      await expect(stateMachine.transit('PAY0001', 'RefundSucceed')).rejects.toMatchObject({
        bizCode: BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED
      })
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled()
    })
  })

  describe('idempotency', () => {
    it('SUCCESS already + PaymentSucceed -> idempotent=true, no event', async () => {
      repoFindOne.mockResolvedValueOnce(buildPayment({ status: PayStatus.SUCCESS }))

      const result = await stateMachine.transit('PAY0001', 'PaymentSucceed')
      expect(result.idempotent).toBe(true)
      expect(result.from).toBe(PayStatus.SUCCESS)
      expect(result.to).toBe(PayStatus.SUCCESS)
      expect(publisher.publish).not.toHaveBeenCalled()
    })
  })

  describe('error cases', () => {
    it('payment_record not found -> throws BIZ_RESOURCE_NOT_FOUND', async () => {
      repoFindOne.mockResolvedValueOnce(null)

      await expect(stateMachine.transit('PAY0001', 'PaymentSucceed')).rejects.toMatchObject({
        bizCode: BizErrorCode.BIZ_RESOURCE_NOT_FOUND
      })
    })

    it('PaymentCreated event has null target -> throws BIZ_STATE_INVALID', async () => {
      /* PaymentCreated maps to CREATED (also non-null) - but RefundCreated maps to null */
      await expect(stateMachine.transit('PAY0001', 'RefundCreated')).rejects.toMatchObject({
        bizCode: BizErrorCode.BIZ_STATE_INVALID
      })
    })
  })

  describe('event publish best-effort', () => {
    it('publisher.publish throws -> swallowed (state already committed)', async () => {
      repoFindOne.mockResolvedValueOnce(buildPayment({ status: PayStatus.CREATED }))
      publisher.publish.mockRejectedValueOnce(new Error('AMQP down'))

      const result = await stateMachine.transit('PAY0001', 'PaymentSucceed')
      expect(result.to).toBe(PayStatus.SUCCESS)
      expect(queryRunner.commitTransaction).toHaveBeenCalled()
    })
  })
})
