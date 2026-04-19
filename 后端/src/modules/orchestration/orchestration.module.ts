/**
 * @file orchestration.module.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc 跨域编排模块装配：Saga + Consumer + DLQ Processor + 8 大业务模块依赖
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 装配清单：
 *
 * Providers (8)：
 *   - SagaRunnerService            通用 saga 执行器（try/catch + DLQ）
 *   - OrderSagaService             订单 9 事件副作用编排
 *   - PaymentSagaService           支付 3 事件副作用编排
 *   - SettleSagaService            OrderFinished → 分账 + 邀请奖励 + 评价提醒
 *   - RefundSagaService            RefundSucceed → 反向分账（TODO P9）+ 通知
 *   - OrderEventsConsumer          AMQP 订阅 o2o.order.events
 *   - PaymentEventsConsumer        AMQP 订阅 o2o.payment.events
 *   - InMemoryEventsConsumer       InMemory 模式回调注册（双模式）
 *   - OrchestrationDlqProcessor    BullMQ orchestration-dlq 消费
 *
 * Imports：
 *   - BullModule.registerQueue({ name: 'orchestration-dlq' })
 *   - OrderModule（OrderService / OrderStateMachine + ORDER_EVENTS_PUBLISHER）
 *   - PaymentModule（RefundService + PAYMENT_EVENTS_PUBLISHER）
 *   - DispatchModule（DispatchService）
 *   - ProductModule（InventoryService）
 *   - MarketingModule（UserCouponService / InviteRelationService）
 *   - FinanceModule（SettlementService）
 *   - MessageModule（MessageService）
 *   - UserModule（OperationLogService for DLQ）
 *   - ReviewModule（保留 import 维持依赖图完整；当前 saga 不直接调 review service）
 *
 * 不 export：
 *   - 本模块作为最外层编排，不被其他业务模块依赖；
 *     其他模块仍直接调彼此的 service（不通过 Saga）
 */

import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DispatchModule } from '@/modules/dispatch/dispatch.module'
import { FinanceModule } from '@/modules/finance/finance.module'
import { MarketingModule } from '@/modules/marketing/marketing.module'
import { MessageModule } from '@/modules/message/message.module'
import { OrderModule } from '@/modules/order/order.module'
import { PaymentModule } from '@/modules/payment/payment.module'
import { ProductModule } from '@/modules/product/product.module'
import { ReviewModule } from '@/modules/review/review.module'
import { UserModule } from '@/modules/user/user.module'
import { InMemoryEventsConsumer } from './consumers/in-memory-events.consumer'
import { OrderEventsConsumer } from './consumers/order-events.consumer'
import { PaymentEventsConsumer } from './consumers/payment-events.consumer'
import { OrchestrationDlqProcessor } from './processors/orchestration-dlq.processor'
import { OrderSagaService } from './sagas/order-saga.service'
import { PaymentSagaService } from './sagas/payment-saga.service'
import { RefundSagaService } from './sagas/refund-saga.service'
import { SettleSagaService } from './sagas/settle-saga.service'
import { SagaRunnerService } from './services/saga-runner.service'
import { ORCHESTRATION_DLQ_QUEUE } from './types/orchestration.types'

@Module({
  imports: [
    BullModule.registerQueue({ name: ORCHESTRATION_DLQ_QUEUE }),
    UserModule,
    MessageModule,
    OrderModule,
    PaymentModule,
    DispatchModule,
    ProductModule,
    MarketingModule,
    FinanceModule,
    ReviewModule
  ],
  providers: [
    ConfigService,
    SagaRunnerService,
    OrderSagaService,
    PaymentSagaService,
    SettleSagaService,
    RefundSagaService,
    OrderEventsConsumer,
    PaymentEventsConsumer,
    InMemoryEventsConsumer,
    OrchestrationDlqProcessor
  ]
})
export class OrchestrationModule {}
