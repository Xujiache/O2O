/**
 * @file mock-app.factory.ts
 * @stage P4/T4.50~T4.51（Sprint 8）
 * @desc 框架级 e2e mock 工厂：组装 SagaRunner + 4 个 Saga + 全 mock 业务 service
 * @author 单 Agent V2.0（Subagent 7）
 *
 * 设计：
 *   - 不启动 NestJS HTTP server（避免 Redis/MySQL/RabbitMQ 强依赖）
 *   - 仅用 NestJS Test.createTestingModule 装配核心 Saga 模块的 service + mock 依赖
 *   - 每个外部 service（OrderStateMachine / SettlementService / ...）以 jest.fn() 实现
 *   - 测试体使用 mockOrderEvent + mockPaymentEvent helper 触发 saga 链路
 *
 * 依赖（全部 mock）：
 *   - OrderService.findCoreByOrderNo
 *   - OrderStateMachine.transit
 *   - InventoryService.commit / restore
 *   - UserCouponService.use / restore
 *   - DispatchService.dispatchOrder
 *   - SettlementService.runForOrder
 *   - InviteRelationService.completeReward
 *   - RefundService.createRefund
 *   - MessageService.send
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { OrderEventsConsumer } from '@/modules/orchestration/consumers/order-events.consumer'
import { PaymentEventsConsumer } from '@/modules/orchestration/consumers/payment-events.consumer'
import { OrderSagaService } from '@/modules/orchestration/sagas/order-saga.service'
import { PaymentSagaService } from '@/modules/orchestration/sagas/payment-saga.service'
import { RefundSagaService } from '@/modules/orchestration/sagas/refund-saga.service'
import { SettleSagaService } from '@/modules/orchestration/sagas/settle-saga.service'
import { SagaRunnerService } from '@/modules/orchestration/services/saga-runner.service'
import { ORCHESTRATION_DLQ_QUEUE } from '@/modules/orchestration/types/orchestration.types'
import { OrderService } from '@/modules/order/services/order.service'
import { OrderStateMachine } from '@/modules/order/state-machine/order-state-machine'
import { InventoryService } from '@/modules/product/inventory.service'
import { UserCouponService } from '@/modules/marketing/services/user-coupon.service'
import { DispatchService } from '@/modules/dispatch/services/dispatch.service'
import { SettlementService } from '@/modules/finance/services/settlement.service'
import { InviteRelationService } from '@/modules/marketing/services/invite-relation.service'
import { RefundService } from '@/modules/payment/services/refund.service'
import { MessageService } from '@/modules/message/message.service'
import { ConfigService } from '@nestjs/config'

/**
 * Mock 集合：每个外部 service 的关键方法 jest.fn()
 *
 * 测试可在 it 内 .mockImplementation / .mockResolvedValue 控制行为
 */
export interface MockSet {
  orderServiceFindCore: jest.Mock
  stateMachineTransit: jest.Mock
  inventoryCommit: jest.Mock
  inventoryRestore: jest.Mock
  userCouponUse: jest.Mock
  userCouponRestore: jest.Mock
  dispatchOrder: jest.Mock
  settlementRunForOrder: jest.Mock
  inviteCompleteReward: jest.Mock
  refundCreateRefund: jest.Mock
  messageSend: jest.Mock
  dlqAdd: jest.Mock
  configGet: jest.Mock
}

/**
 * 测试装配输出
 */
export interface MockApp {
  module: TestingModule
  mocks: MockSet
  orderConsumer: OrderEventsConsumer
  paymentConsumer: PaymentEventsConsumer
  orderSaga: OrderSagaService
  paymentSaga: PaymentSagaService
  settleSaga: SettleSagaService
  refundSaga: RefundSagaService
}

/**
 * 创建 mock-app
 *
 * 用途：
 *   - takeout-flow.e2e-spec.ts / errand-flow.e2e-spec.ts 在 beforeEach 调用
 *   - 返回的 mocks 集合提供给测试体注入返回值
 */
export async function createMockApp(): Promise<MockApp> {
  const mocks: MockSet = {
    orderServiceFindCore: jest.fn(),
    stateMachineTransit: jest.fn(),
    inventoryCommit: jest.fn().mockResolvedValue(undefined),
    inventoryRestore: jest.fn().mockResolvedValue(undefined),
    userCouponUse: jest.fn().mockResolvedValue({ id: 'UC1', status: 2 }),
    userCouponRestore: jest.fn().mockResolvedValue({ id: 'UC1', status: 1 }),
    dispatchOrder: jest.fn().mockResolvedValue({ id: 'DR1' }),
    settlementRunForOrder: jest
      .fn()
      .mockResolvedValue({ orderNo: '', created: 3, executed: 3, failed: 0, skipped: 0 }),
    inviteCompleteReward: jest.fn().mockResolvedValue(undefined),
    refundCreateRefund: jest
      .fn()
      .mockResolvedValue({ refundNo: 'REF001', payNo: 'PAY001', amount: '0.00', status: 2 }),
    messageSend: jest.fn().mockResolvedValue({ sent: true }),
    dlqAdd: jest.fn().mockResolvedValue({ id: 'job-1' }),
    configGet: jest.fn().mockReturnValue('')
  }

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SagaRunnerService,
      OrderSagaService,
      PaymentSagaService,
      SettleSagaService,
      RefundSagaService,
      OrderEventsConsumer,
      PaymentEventsConsumer,

      {
        provide: getQueueToken(ORCHESTRATION_DLQ_QUEUE),
        useValue: { add: mocks.dlqAdd }
      },

      {
        provide: ConfigService,
        useValue: { get: mocks.configGet }
      },

      {
        provide: OrderService,
        useValue: { findCoreByOrderNo: mocks.orderServiceFindCore }
      },
      {
        provide: OrderStateMachine,
        useValue: { transit: mocks.stateMachineTransit }
      },
      {
        provide: InventoryService,
        useValue: { commit: mocks.inventoryCommit, restore: mocks.inventoryRestore }
      },
      {
        provide: UserCouponService,
        useValue: { use: mocks.userCouponUse, restore: mocks.userCouponRestore }
      },
      {
        provide: DispatchService,
        useValue: { dispatchOrder: mocks.dispatchOrder }
      },
      {
        provide: SettlementService,
        useValue: { runForOrder: mocks.settlementRunForOrder }
      },
      {
        provide: InviteRelationService,
        useValue: { completeReward: mocks.inviteCompleteReward }
      },
      {
        provide: RefundService,
        useValue: { createRefund: mocks.refundCreateRefund }
      },
      {
        provide: MessageService,
        useValue: { send: mocks.messageSend }
      }
    ]
  }).compile()

  return {
    module,
    mocks,
    orderConsumer: module.get(OrderEventsConsumer),
    paymentConsumer: module.get(PaymentEventsConsumer),
    orderSaga: module.get(OrderSagaService),
    paymentSaga: module.get(PaymentSagaService),
    settleSaga: module.get(SettleSagaService),
    refundSaga: module.get(RefundSagaService)
  }
}
