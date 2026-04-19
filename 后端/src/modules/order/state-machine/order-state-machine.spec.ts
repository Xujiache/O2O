/**
 * @file order-state-machine.spec.ts
 * @stage P4/T4.52?Sprint 8?
 * @desc OrderStateMachine ????????? + CAS ?? + ??? + ???? best-effort
 * @author ? Agent V2.0?Subagent 7?Orchestration + ???
 *
 * ?????
 *   1) ????????? 0?10?OrderPaid?/ 10?20?OrderAccepted?/ 50?55?OrderFinished?
 *   2) ????? BIZ_ORDER_STATE_NOT_ALLOWED 10301
 *   3) CAS ???affectedRows=0?? BIZ_DATA_CONFLICT 10011
 *   4) ????? BIZ_DATA_CONFLICT
 *   5) ?? publish ??? warn???????
 *   6) ?? 0?10?OrderPaid?/ 20?30?OrderPicked???
 *
 * Mock ???
 *   - Redis: jest.fn() set/eval
 *   - DataSource: createQueryRunner + connect + startTransaction + commit + rollback + release
 *   - Publisher: ?? jest.fn() publish
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { ORDER_EVENTS_PUBLISHER } from '@/modules/order/events/order-events.constants'
import { OrderStateMachine } from './order-state-machine'
import { OrderOpTypeEnum, OrderTypeEnum } from '../types/order.types'

interface RedisMock {
  set: jest.Mock
  eval: jest.Mock
}

interface PublisherMock {
  publish: jest.Mock
}

interface QueryRunnerMock {
  connect: jest.Mock
  startTransaction: jest.Mock
  commitTransaction: jest.Mock
  rollbackTransaction: jest.Mock
  release: jest.Mock
  manager: { query: jest.Mock }
}

describe('OrderStateMachine', () => {
  let stateMachine: OrderStateMachine
  let redis: RedisMock
  let publisher: PublisherMock
  let queryRunner: QueryRunnerMock
  let dataSourceQuery: jest.Mock

  const VALID_TAKEOUT_ORDERNO = 'T20260419000001234'
  const VALID_ERRAND_ORDERNO = 'E20260419000001234'

  beforeEach(async () => {
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1)
    }
    publisher = { publish: jest.fn().mockResolvedValue(undefined) }

    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: { query: jest.fn() }
    }

    dataSourceQuery = jest.fn()
    const fakeDataSource = {
      query: dataSourceQuery,
      createQueryRunner: jest.fn().mockReturnValue(queryRunner)
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OrderStateMachine,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getDataSourceToken(), useValue: fakeDataSource },
        { provide: ORDER_EVENTS_PUBLISHER, useValue: publisher }
      ]
    }).compile()

    stateMachine = moduleRef.get(OrderStateMachine)
  })

  describe('Redis lock', () => {
    it('order no length invalid -> throws PARAM_INVALID 10001', async () => {
      await expect(
        stateMachine.transit('SHORT', OrderTypeEnum.TAKEOUT, 'OrderPaid', {
          opType: OrderOpTypeEnum.SYSTEM,
          opId: null
        })
      ).rejects.toThrow(BusinessException)
    })

    it('SET NX returns null -> throws BIZ_DATA_CONFLICT 10011', async () => {
      redis.set.mockResolvedValueOnce(null)
      await expect(
        stateMachine.transit(VALID_TAKEOUT_ORDERNO, OrderTypeEnum.TAKEOUT, 'OrderPaid', {
          opType: OrderOpTypeEnum.SYSTEM,
          opId: null
        })
      ).rejects.toMatchObject({ bizCode: BizErrorCode.BIZ_DATA_CONFLICT })
    })
  })

  describe('takeout transitions', () => {
    it('0 -> 10 (OrderPaid) commits + emits event', async () => {
      queryRunner.manager.query
        .mockResolvedValueOnce([
          {
            status: 0,
            pay_status: 0,
            user_id: 'U1',
            shop_id: 'S1',
            merchant_id: 'M1',
            rider_id: null
          }
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })

      const result = await stateMachine.transit(
        VALID_TAKEOUT_ORDERNO,
        OrderTypeEnum.TAKEOUT,
        'OrderPaid',
        {
          opType: OrderOpTypeEnum.SYSTEM,
          opId: null,
          additionalFields: { payAt: new Date() }
        }
      )

      expect(result.fromStatus).toBe(0)
      expect(result.toStatus).toBe(10)
      expect(result.event).toBe('OrderPaid')
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1)
      expect(publisher.publish).toHaveBeenCalledTimes(1)
      expect(publisher.publish.mock.calls[0]?.[0]).toMatchObject({
        eventName: 'OrderPaid',
        fromStatus: 0,
        toStatus: 10
      })
      expect(redis.eval).toHaveBeenCalled()
    })

    it('10 -> 20 (OrderAccepted) commits', async () => {
      queryRunner.manager.query
        .mockResolvedValueOnce([
          {
            status: 10,
            pay_status: 2,
            user_id: 'U1',
            shop_id: 'S1',
            merchant_id: 'M1',
            rider_id: null
          }
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })

      const result = await stateMachine.transit(
        VALID_TAKEOUT_ORDERNO,
        OrderTypeEnum.TAKEOUT,
        'OrderAccepted',
        { opType: OrderOpTypeEnum.MERCHANT, opId: 'M1' }
      )

      expect(result.fromStatus).toBe(10)
      expect(result.toStatus).toBe(20)
    })

    it('50 -> 55 (OrderFinished) commits', async () => {
      queryRunner.manager.query
        .mockResolvedValueOnce([
          {
            status: 50,
            pay_status: 2,
            user_id: 'U1',
            shop_id: 'S1',
            merchant_id: 'M1',
            rider_id: 'R1'
          }
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })

      const result = await stateMachine.transit(
        VALID_TAKEOUT_ORDERNO,
        OrderTypeEnum.TAKEOUT,
        'OrderFinished',
        { opType: OrderOpTypeEnum.USER, opId: 'U1' }
      )

      expect(result.fromStatus).toBe(50)
      expect(result.toStatus).toBe(55)
    })

    it('current status=20 + event=OrderPaid -> throws BIZ_ORDER_STATE_NOT_ALLOWED 10301', async () => {
      queryRunner.manager.query.mockResolvedValueOnce([
        {
          status: 20,
          pay_status: 2,
          user_id: 'U1',
          shop_id: 'S1',
          merchant_id: 'M1',
          rider_id: null
        }
      ])

      await expect(
        stateMachine.transit(VALID_TAKEOUT_ORDERNO, OrderTypeEnum.TAKEOUT, 'OrderPaid', {
          opType: OrderOpTypeEnum.SYSTEM,
          opId: null
        })
      ).rejects.toMatchObject({ bizCode: BizErrorCode.BIZ_ORDER_STATE_NOT_ALLOWED })

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled()
    })

    it('CAS miss (affectedRows=0) -> throws BIZ_DATA_CONFLICT 10011 and rollbacks', async () => {
      queryRunner.manager.query
        .mockResolvedValueOnce([
          {
            status: 0,
            pay_status: 0,
            user_id: 'U1',
            shop_id: 'S1',
            merchant_id: 'M1',
            rider_id: null
          }
        ])
        .mockResolvedValueOnce({ affectedRows: 0 })

      await expect(
        stateMachine.transit(VALID_TAKEOUT_ORDERNO, OrderTypeEnum.TAKEOUT, 'OrderPaid', {
          opType: OrderOpTypeEnum.SYSTEM,
          opId: null
        })
      ).rejects.toMatchObject({ bizCode: BizErrorCode.BIZ_DATA_CONFLICT })

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled()
    })
  })

  describe('errand transitions', () => {
    it('0 -> 10 (OrderPaid) commits', async () => {
      queryRunner.manager.query
        .mockResolvedValueOnce([{ status: 0, pay_status: 0, user_id: 'U1', rider_id: null }])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })

      const result = await stateMachine.transit(
        VALID_ERRAND_ORDERNO,
        OrderTypeEnum.ERRAND,
        'OrderPaid',
        { opType: OrderOpTypeEnum.SYSTEM, opId: null }
      )
      expect(result.fromStatus).toBe(0)
      expect(result.toStatus).toBe(10)
    })

    it('20 -> 30 (OrderPicked) commits', async () => {
      queryRunner.manager.query
        .mockResolvedValueOnce([{ status: 20, pay_status: 2, user_id: 'U1', rider_id: 'R1' }])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })

      const result = await stateMachine.transit(
        VALID_ERRAND_ORDERNO,
        OrderTypeEnum.ERRAND,
        'OrderPicked',
        { opType: OrderOpTypeEnum.RIDER, opId: 'R1' }
      )
      expect(result.fromStatus).toBe(20)
      expect(result.toStatus).toBe(30)
    })
  })

  describe('event publishing', () => {
    it('publisher throwing does not roll back the committed transaction', async () => {
      queryRunner.manager.query
        .mockResolvedValueOnce([
          {
            status: 0,
            pay_status: 0,
            user_id: 'U1',
            shop_id: 'S1',
            merchant_id: 'M1',
            rider_id: null
          }
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })

      publisher.publish.mockRejectedValueOnce(new Error('AMQP down'))

      await expect(
        stateMachine.transit(VALID_TAKEOUT_ORDERNO, OrderTypeEnum.TAKEOUT, 'OrderPaid', {
          opType: OrderOpTypeEnum.SYSTEM,
          opId: null
        })
      ).rejects.toThrow('AMQP down')
      expect(queryRunner.commitTransaction).toHaveBeenCalled()
    })

    it('skipPublish=true bypasses publisher', async () => {
      queryRunner.manager.query
        .mockResolvedValueOnce([
          {
            status: 0,
            pay_status: 0,
            user_id: 'U1',
            shop_id: 'S1',
            merchant_id: 'M1',
            rider_id: null
          }
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })

      await stateMachine.transit(VALID_TAKEOUT_ORDERNO, OrderTypeEnum.TAKEOUT, 'OrderPaid', {
        opType: OrderOpTypeEnum.SYSTEM,
        opId: null,
        skipPublish: true
      })
      expect(publisher.publish).not.toHaveBeenCalled()
    })
  })

  describe('getCurrentStatus', () => {
    it('returns 10 when row found', async () => {
      dataSourceQuery.mockResolvedValueOnce([{ status: 10 }])
      const status = await stateMachine.getCurrentStatus(
        VALID_TAKEOUT_ORDERNO,
        OrderTypeEnum.TAKEOUT
      )
      expect(status).toBe(10)
    })

    it('throws BIZ_ORDER_NOT_FOUND 10300 when row missing', async () => {
      dataSourceQuery.mockResolvedValueOnce([])
      await expect(
        stateMachine.getCurrentStatus(VALID_TAKEOUT_ORDERNO, OrderTypeEnum.TAKEOUT)
      ).rejects.toMatchObject({ bizCode: BizErrorCode.BIZ_ORDER_NOT_FOUND })
    })
  })
})
