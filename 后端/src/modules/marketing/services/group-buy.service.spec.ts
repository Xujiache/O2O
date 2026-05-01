/**
 * @file group-buy.service.spec.ts
 * @stage P9 Sprint 3 / W3.D.2
 * @desc GroupBuyService 单测：成团时触发 GroupBuySagaService.handleGroupBuyAchieved
 * @author Sprint3-Agent D
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Promotion } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { GroupBuyService } from './group-buy.service'
import { PromotionRuleValidatorService } from './promotion-rule-validator.service'
import { GroupBuySagaService } from '@/modules/orchestration/services/group-buy-saga.service'

interface RedisMock {
  sadd: jest.Mock
  scard: jest.Mock
  smembers: jest.Mock
  hset: jest.Mock
  hget: jest.Mock
  hgetall: jest.Mock
  expire: jest.Mock
  lrange: jest.Mock
}

describe('GroupBuyService.joinGroup —— 成团事件触发', () => {
  let service: GroupBuyService
  let promotionRepo: { findOne: jest.Mock }
  let redis: RedisMock
  let ruleValidator: { parseGroupBuy: jest.Mock }
  let saga: { handleGroupBuyAchieved: jest.Mock }

  beforeEach(async () => {
    promotionRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'P1',
        promoType: 3,
        status: 1,
        validFrom: new Date(Date.now() - 3600_000),
        validTo: new Date(Date.now() + 3600_000),
        ruleJson: {},
        isDeleted: 0
      })
    }
    redis = {
      sadd: jest.fn().mockResolvedValue(1),
      scard: jest.fn().mockResolvedValue(2) /* 默认成团（rule.groupSize=2） */,
      smembers: jest.fn().mockResolvedValue(['U1', 'U2']),
      hset: jest.fn().mockResolvedValue(1),
      hget: jest.fn().mockResolvedValue('pending'),
      hgetall: jest.fn().mockResolvedValue({ status: 'success', groupSize: '2' }),
      expire: jest.fn().mockResolvedValue(1),
      lrange: jest.fn().mockResolvedValue(['T20260420010000001', 'T20260420010000002'])
    }
    ruleValidator = {
      parseGroupBuy: jest.fn().mockReturnValue({
        groupSize: 2,
        discountPerHead: '5.00',
        timeoutMinutes: 30
      })
    }
    saga = {
      handleGroupBuyAchieved: jest.fn().mockResolvedValue({
        sagaId: 'sg-1',
        failedStep: null,
        executedSteps: [],
        error: null,
        compensated: 0
      })
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GroupBuyService,
        { provide: getRepositoryToken(Promotion), useValue: promotionRepo },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: PromotionRuleValidatorService, useValue: ruleValidator },
        { provide: GroupBuySagaService, useValue: saga }
      ]
    }).compile()
    service = moduleRef.get(GroupBuyService)
  })

  it('成团时刻发布 GroupBuyAchieved 事件 → 调 saga.handleGroupBuyAchieved', async () => {
    const result = await service.joinGroup('P1', 'U2', undefined)
    expect(result.status).toBe('success')
    expect(saga.handleGroupBuyAchieved).toHaveBeenCalledTimes(1)
    const arg = saga.handleGroupBuyAchieved.mock.calls[0][0]
    expect(arg.groupId.startsWith('P1:')).toBe(true)
    expect(arg.leaderOrderNo).toBe('T20260420010000001')
    expect(arg.memberOrderNos).toEqual(['T20260420010000002'])
    expect(typeof arg.achievedAt).toBe('number')
  })

  it('未成团（scard < groupSize）→ 不触发 saga', async () => {
    redis.scard.mockResolvedValue(1)
    const result = await service.joinGroup('P1', 'U1', undefined)
    expect(result.status).toBe('pending')
    expect(saga.handleGroupBuyAchieved).not.toHaveBeenCalled()
  })

  it('saga 抛错 → 主流程不阻断', async () => {
    saga.handleGroupBuyAchieved.mockRejectedValueOnce(new Error('saga down'))
    /* 不应抛 */
    await expect(service.joinGroup('P1', 'U2', undefined)).resolves.toMatchObject({
      status: 'success'
    })
  })

  it('groupbuy:order:* 列表为空 → 跳过 saga（leader=空）', async () => {
    redis.lrange.mockResolvedValue([])
    const result = await service.joinGroup('P1', 'U2', undefined)
    expect(result.status).toBe('success')
    expect(saga.handleGroupBuyAchieved).not.toHaveBeenCalled()
  })
})
