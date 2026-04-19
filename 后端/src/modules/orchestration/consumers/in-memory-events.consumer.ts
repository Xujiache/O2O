/**
 * @file in-memory-events.consumer.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc InMemory 模式：把 OrderEventsPublisher / PaymentEventsPublisher 的 listener
 *       钩到 OrderEventsConsumer / PaymentEventsConsumer.dispatch，使本机自验证 / 单测
 *       无需 docker 即可走完整 Saga 链路
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 工作模式：
 *   - 启动时检查 ORDER_EVENTS_PUBLISHER 是否为 InMemoryOrderEventsPublisher 实例
 *   - 是 → setListener(payload => OrderEventsConsumer.dispatch(payload))
 *   - 否（AMQP 模式）→ 不做任何操作（AMQP consumer 自管）
 *   - 同理处理 PAYMENT_EVENTS_PUBLISHER
 *
 * 设计意图：
 *   - 业务 service 仍统一调 publisher.publish；不感知 InMemory / AMQP 差异
 *   - 自验证 / 单测 / e2e 时，只要 RABBITMQ_URL 缺失，就自动走 InMemory 链路
 */

import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import {
  ORDER_EVENTS_PUBLISHER,
  type OrderEventPayload
} from '@/modules/order/events/order-events.constants'
import {
  InMemoryOrderEventsPublisher,
  type OrderEventsPublisher
} from '@/modules/order/events/order-events.publisher'
import {
  PAYMENT_EVENTS_PUBLISHER,
  InMemoryPaymentEventsPublisher,
  type PaymentEventPayload,
  type PaymentEventsPublisher
} from '@/modules/payment/services/payment-events.publisher'
import { OrderEventsConsumer } from './order-events.consumer'
import { PaymentEventsConsumer } from './payment-events.consumer'

@Injectable()
export class InMemoryEventsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(InMemoryEventsConsumer.name)

  constructor(
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly orderPublisher: OrderEventsPublisher,
    @Inject(PAYMENT_EVENTS_PUBLISHER)
    private readonly paymentPublisher: PaymentEventsPublisher,
    private readonly orderConsumer: OrderEventsConsumer,
    private readonly paymentConsumer: PaymentEventsConsumer
  ) {}

  /**
   * 启动时检查 publisher 是否 InMemory 实例 → 注册回调
   */
  onApplicationBootstrap(): void {
    if (this.orderPublisher instanceof InMemoryOrderEventsPublisher) {
      this.orderPublisher.setListener(async (payload: OrderEventPayload) => {
        await this.orderConsumer.dispatch(payload)
      })
      this.logger.log('[InMemory] OrderEvents listener 已挂载（事件 → OrderSaga / SettleSaga）')
    } else {
      this.logger.debug('[InMemory] OrderEvents 处于 AMQP 模式，跳过 InMemory 监听')
    }

    if (this.paymentPublisher instanceof InMemoryPaymentEventsPublisher) {
      this.paymentPublisher.setListener(async (payload: PaymentEventPayload) => {
        await this.paymentConsumer.dispatch(payload)
      })
      this.logger.log('[InMemory] PaymentEvents listener 已挂载（事件 → PaymentSaga / RefundSaga）')
    } else {
      this.logger.debug('[InMemory] PaymentEvents 处于 AMQP 模式，跳过 InMemory 监听')
    }
  }
}
