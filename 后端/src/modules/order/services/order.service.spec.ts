/**
 * @file order.service.spec.ts
 * @stage P9 Sprint 3 / W3.D.2
 * @desc OrderService.mergeForGroup 单测：happy / 状态错误 / 部分失败回滚
 * @author Sprint3-Agent D
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { BusinessException } from '@/common'
import { Shop } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OrderTakeoutStatusEnum } from '../types/order.types'
import { OrderService } from './order.service'

interface MockQueryRunner {
  connect: jest.Mock
  startTransaction: jest.Mock
  commitTransaction: jest.Mock
  rollbackTransaction: jest.Mock
  release: jest.Mock
  manager: { query: jest.Mock }
}

describe('OrderService.mergeForGroup', () => {
  let service: OrderService
  let qr: MockQueryRunner
  let dataSource: { createQueryRunner: jest.Mock }

  const LEADER = 'T20260420010000001'
  const MEMBER1 = 'T20260420010000002'
  const MEMBER2 = 'T20260420010000003'

  beforeEach(async () => {
    qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: { query: jest.fn() }
    }
    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(qr)
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: REDIS_CLIENT, useValue: {} },
        { provide: getRepositoryToken(Shop), useValue: {} }
      ]
    }).compile()
    service = moduleRef.get(OrderService)
  })

  it('happy: 成功合并 → commit + 返回 leader 单号', async () => {
    qr.manager.query
      .mockResolvedValueOnce([
        {
          order_no: LEADER,
          shop_id: 'S1',
          status: OrderTakeoutStatusEnum.PENDING_ACCEPT,
          pay_status: 2,
          goods_amount: '10.00',
          pay_amount: '12.00'
        },
        {
          order_no: MEMBER1,
          shop_id: 'S1',
          status: OrderTakeoutStatusEnum.PENDING_ACCEPT,
          pay_status: 2,
          goods_amount: '20.00',
          pay_amount: '22.00'
        },
        {
          order_no: MEMBER2,
          shop_id: 'S1',
          status: OrderTakeoutStatusEnum.PENDING_ACCEPT,
          pay_status: 2,
          goods_amount: '5.00',
          pay_amount: '7.00'
        }
      ])
      .mockResolvedValueOnce({}) /* update items */
      .mockResolvedValueOnce({}) /* update leader amounts */
      .mockResolvedValueOnce({}) /* mark members canceled */

    const r = await service.mergeForGroup([LEADER, MEMBER1, MEMBER2], LEADER)
    expect(r.mergedOrderNo).toBe(LEADER)
    expect(qr.commitTransaction).toHaveBeenCalledTimes(1)
    expect(qr.rollbackTransaction).not.toHaveBeenCalled()
    expect(qr.release).toHaveBeenCalledTimes(1)

    /* 校验金额拼装：35.00 / 41.00 */
    const updateLeaderArgs = qr.manager.query.mock.calls[2]?.[1] as unknown[]
    expect(updateLeaderArgs[0]).toBe('35.00')
    expect(updateLeaderArgs[1]).toBe('41.00')
    expect(updateLeaderArgs[2]).toBe(LEADER)

    /* 校验 member 标 CANCELED + cancel_reason 含 MERGED 前缀 */
    const cancelArgs = qr.manager.query.mock.calls[3]?.[1] as unknown[]
    expect(cancelArgs[0]).toBe(OrderTakeoutStatusEnum.CANCELED)
    expect(String(cancelArgs[1])).toMatch(/^MERGED:/)
  })

  it('状态错误：status=ACCEPTED → 抛 BIZ_ORDER_STATE_NOT_ALLOWED + rollback', async () => {
    qr.manager.query.mockResolvedValueOnce([
      {
        order_no: LEADER,
        shop_id: 'S1',
        status: OrderTakeoutStatusEnum.ACCEPTED /* 20 不允许 */,
        pay_status: 2,
        goods_amount: '10.00',
        pay_amount: '10.00'
      },
      {
        order_no: MEMBER1,
        shop_id: 'S1',
        status: OrderTakeoutStatusEnum.PENDING_ACCEPT,
        pay_status: 2,
        goods_amount: '5.00',
        pay_amount: '5.00'
      }
    ])

    await expect(service.mergeForGroup([LEADER, MEMBER1], LEADER)).rejects.toThrow(
      BusinessException
    )
    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1)
    expect(qr.commitTransaction).not.toHaveBeenCalled()
  })

  it('店铺不一致：抛 BIZ_ORDER_STATE_NOT_ALLOWED + rollback', async () => {
    qr.manager.query.mockResolvedValueOnce([
      {
        order_no: LEADER,
        shop_id: 'S1',
        status: OrderTakeoutStatusEnum.PENDING_ACCEPT,
        pay_status: 2,
        goods_amount: '10.00',
        pay_amount: '10.00'
      },
      {
        order_no: MEMBER1,
        shop_id: 'S2' /* 不一致 */,
        status: OrderTakeoutStatusEnum.PENDING_ACCEPT,
        pay_status: 2,
        goods_amount: '5.00',
        pay_amount: '5.00'
      }
    ])

    await expect(service.mergeForGroup([LEADER, MEMBER1], LEADER)).rejects.toThrow(
      BusinessException
    )
    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1)
  })

  it('订单缺失：rows.length 不匹配 → 抛 BIZ_ORDER_NOT_FOUND + rollback', async () => {
    qr.manager.query.mockResolvedValueOnce([
      {
        order_no: LEADER,
        shop_id: 'S1',
        status: OrderTakeoutStatusEnum.PENDING_ACCEPT,
        pay_status: 2,
        goods_amount: '10.00',
        pay_amount: '10.00'
      }
      /* 缺 MEMBER1 */
    ])

    await expect(service.mergeForGroup([LEADER, MEMBER1], LEADER)).rejects.toThrow(
      BusinessException
    )
    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1)
  })

  it('合并 < 2 单：抛 BIZ_ORDER_STATE_NOT_ALLOWED', async () => {
    await expect(service.mergeForGroup([LEADER], LEADER)).rejects.toThrow(BusinessException)
    /* 注意：早抛在 query 之前；queryRunner 不应被创建 */
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled()
  })

  it('leader 为空：抛 SYSTEM_INTERNAL_ERROR', async () => {
    await expect(service.mergeForGroup([LEADER, MEMBER1], '')).rejects.toThrow(BusinessException)
  })

  it('部分 SQL 失败 → rollback + release', async () => {
    qr.manager.query
      .mockResolvedValueOnce([
        {
          order_no: LEADER,
          shop_id: 'S1',
          status: OrderTakeoutStatusEnum.PENDING_ACCEPT,
          pay_status: 2,
          goods_amount: '10.00',
          pay_amount: '10.00'
        },
        {
          order_no: MEMBER1,
          shop_id: 'S1',
          status: OrderTakeoutStatusEnum.PENDING_ACCEPT,
          pay_status: 2,
          goods_amount: '5.00',
          pay_amount: '5.00'
        }
      ])
      .mockRejectedValueOnce(new Error('UPDATE items failed'))

    await expect(service.mergeForGroup([LEADER, MEMBER1], LEADER)).rejects.toThrow(
      'UPDATE items failed'
    )
    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1)
    expect(qr.release).toHaveBeenCalledTimes(1)
  })
})
