/**
 * @file group-buy-saga.service.spec.ts
 * @stage P9 Sprint 3 / W3.D.2
 * @desc GroupBuySagaService 单测：订阅事件 + 调 SagaRunner / 退化为 inline 顺序执行
 * @author Sprint3-Agent D
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { ModuleRef } from '@nestjs/core'
import type { GroupBuyAchievedEvent } from '@/modules/marketing/services/group-buy.service'
import { OrderService } from '@/modules/order/services/order.service'
import { DispatchService } from '@/modules/dispatch/services/dispatch.service'
import { GroupBuySagaService } from './group-buy-saga.service'
import { SagaRunnerService } from './saga-runner.service'

const LEADER = 'T20260420010000001'
const MEMBER = 'T20260420010000002'

const event = (overrides: Partial<GroupBuyAchievedEvent> = {}): GroupBuyAchievedEvent => ({
  groupId: 'P1:G1',
  leaderOrderNo: LEADER,
  memberOrderNos: [MEMBER],
  achievedAt: Date.now(),
  ...overrides
})

describe('GroupBuySagaService', () => {
  let saga: GroupBuySagaService
  let mergeMock: jest.Mock
  let dispatchMock: jest.Mock
  let runnerExecute: jest.Mock | null
  let moduleRef: { get: jest.Mock }

  beforeEach(async () => {
    mergeMock = jest.fn().mockResolvedValue({ mergedOrderNo: LEADER })
    dispatchMock = jest.fn().mockResolvedValue(undefined)
    runnerExecute = null

    moduleRef = {
      get: jest.fn().mockImplementation((token: unknown) => {
        if (token === OrderService) return { mergeForGroup: mergeMock }
        if (token === DispatchService) return { dispatchOrder: dispatchMock }
        if (token === SagaRunnerService) {
          if (runnerExecute) return { execute: runnerExecute }
          throw new Error('saga runner not provided in this test')
        }
        throw new Error(`unknown token: ${String(token)}`)
      })
    }

    const moduleRefRef: TestingModule = await Test.createTestingModule({
      providers: [GroupBuySagaService, { provide: ModuleRef, useValue: moduleRef }]
    }).compile()
    saga = moduleRefRef.get(GroupBuySagaService)
  })

  it('inline 模式（无 runner）：依次跑 ValidateGroup / MergeOrders / TriggerDispatch', async () => {
    const r = await saga.handleGroupBuyAchieved(event())
    expect(r.failedStep).toBeNull()
    expect(r.executedSteps).toEqual(['ValidateGroup', 'MergeOrders', 'TriggerDispatch'])
    expect(mergeMock).toHaveBeenCalledWith([LEADER, MEMBER], LEADER)
    expect(dispatchMock).toHaveBeenCalledWith(LEADER, 1, 0)
  })

  it('SagaRunner 存在时：通过 runner.execute 路由', async () => {
    runnerExecute = jest.fn().mockResolvedValue({
      sagaId: 'sg-1',
      sagaName: 'GroupBuyMergeSaga',
      executedSteps: ['ValidateGroup', 'MergeOrders', 'TriggerDispatch'],
      failedStep: null,
      error: null,
      compensated: 0
    })
    const r = await saga.handleGroupBuyAchieved(event())
    expect(runnerExecute).toHaveBeenCalledTimes(1)
    expect(r.sagaId).toBe('sg-1')
    /* runner 接管，service 直接调用不再发生 */
    expect(mergeMock).not.toHaveBeenCalled()
  })

  it('memberOrderNos 为空 → ValidateGroup 抛错（inline 模式标 failedStep）', async () => {
    const r = await saga.handleGroupBuyAchieved(event({ memberOrderNos: [] }))
    expect(r.failedStep).toBe('ValidateGroup')
    expect(mergeMock).not.toHaveBeenCalled()
  })

  it('OrderService 缺失：MergeOrders 跳过但 saga 仍成功', async () => {
    moduleRef.get = jest.fn().mockImplementation((token: unknown) => {
      if (token === OrderService) throw new Error('not registered')
      if (token === DispatchService) return { dispatchOrder: dispatchMock }
      if (token === SagaRunnerService) throw new Error('not registered')
      throw new Error(`unknown token: ${String(token)}`)
    })
    const r = await saga.handleGroupBuyAchieved(event())
    expect(r.failedStep).toBeNull()
    expect(mergeMock).not.toHaveBeenCalled()
    /* TriggerDispatch 没 mergedOrderNo 就跳过 */
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('mergeForGroup 抛错 → failedStep=MergeOrders（inline）', async () => {
    mergeMock.mockRejectedValueOnce(new Error('merge fail'))
    const r = await saga.handleGroupBuyAchieved(event())
    expect(r.failedStep).toBe('MergeOrders')
    expect(r.error).toBe('merge fail')
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('DispatchService 抛错 → 仅 warn，不阻断 saga 成功', async () => {
    dispatchMock.mockRejectedValueOnce(new Error('dispatch fail'))
    const r = await saga.handleGroupBuyAchieved(event())
    expect(r.failedStep).toBeNull()
    expect(r.executedSteps).toContain('TriggerDispatch')
  })
})
