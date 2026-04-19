/**
 * @file payment-events.consumer.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc AMQP 订阅 o2o.payment.events Topic Exchange → 路由到 PaymentSaga / RefundSaga
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 拓扑：
 *   Exchange: o2o.payment.events (topic, durable)
 *   Queue:    orchestration.payment
 *   Binding:  routingKey = 'payment.*'
 *   Prefetch: 8
 *
 * 路由：
 *   PaymentSucceed / PaymentFailed / PaymentClosed → PaymentSaga
 *   RefundSucceed → RefundSaga
 *   PaymentCreated / RefundCreated / RefundFailed → 仅 debug 日志
 */

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqplib from 'amqplib'
import type { Channel, ChannelModel } from 'amqplib'
import {
  PAYMENT_EVENTS_EXCHANGE,
  PAYMENT_EVENTS_EXCHANGE_TYPE,
  type PaymentEventPayload
} from '@/modules/payment/services/payment-events.publisher'
import { PaymentSagaService } from '../sagas/payment-saga.service'
import { RefundSagaService } from '../sagas/refund-saga.service'
import {
  EventSourceEnum,
  ORCHESTRATION_PAYMENT_QUEUE,
  ORCHESTRATION_PAYMENT_ROUTING_PATTERN,
  type PaymentEventEnvelope
} from '../types/orchestration.types'

@Injectable()
export class PaymentEventsConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PaymentEventsConsumer.name)
  private connection?: ChannelModel
  private channel?: Channel
  private readonly amqpUrl: string

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    private readonly paymentSaga: PaymentSagaService,
    private readonly refundSaga: RefundSagaService
  ) {
    this.amqpUrl = config.get<string>('rabbitmq.url', '')
  }

  /**
   * 启动 AMQP 订阅
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.amqpUrl) {
      this.logger.warn(
        'RABBITMQ_URL 未配置，PaymentEventsConsumer 不订阅；InMemory 由 in-memory-events.consumer 接管'
      )
      return
    }
    try {
      await this.startAmqpConsumer()
    } catch (err) {
      this.logger.warn(
        `PaymentEventsConsumer 启动失败：${err instanceof Error ? err.message : String(err)}（开发态可忽略）`
      )
    }
  }

  /**
   * 销毁
   */
  async onModuleDestroy(): Promise<void> {
    try {
      if (this.channel) await this.channel.close()
    } catch {
      /* ignore */
    }
    try {
      if (this.connection) await this.connection.close()
    } catch {
      /* ignore */
    }
  }

  /**
   * 处理一条事件（Public：供 InMemory 模式 / 单测注入）
   */
  async dispatch(payload: PaymentEventPayload): Promise<void> {
    const envelope: PaymentEventEnvelope = {
      source: EventSourceEnum.PAYMENT,
      eventName: payload.eventName,
      body: payload,
      receivedAt: Date.now(),
      traceId: payload.traceId ?? ''
    }
    if (payload.eventName === 'RefundSucceed') {
      await this.refundSaga.handleRefundSucceed(envelope)
      return
    }
    if (
      payload.eventName === 'PaymentSucceed' ||
      payload.eventName === 'PaymentFailed' ||
      payload.eventName === 'PaymentClosed'
    ) {
      await this.paymentSaga.handlePaymentEvent(envelope)
      return
    }
    this.logger.debug(`[PAY-CONSUMER] 事件 ${payload.eventName} 不路由（payNo=${payload.payNo}）`)
  }

  /**
   * 启动 AMQP 消费者
   */
  private async startAmqpConsumer(): Promise<void> {
    this.connection = await amqplib.connect(this.amqpUrl)
    this.connection.on('error', (err: Error) =>
      this.logger.error(`amqplib connection error：${err.message}`)
    )
    this.connection.on('close', () => {
      this.logger.warn('PaymentEventsConsumer RabbitMQ 连接关闭')
      this.connection = undefined
      this.channel = undefined
    })
    const channel = await this.connection.createChannel()
    this.channel = channel
    await channel.assertExchange(PAYMENT_EVENTS_EXCHANGE, PAYMENT_EVENTS_EXCHANGE_TYPE, {
      durable: true
    })
    await channel.assertQueue(ORCHESTRATION_PAYMENT_QUEUE, { durable: true })
    await channel.bindQueue(
      ORCHESTRATION_PAYMENT_QUEUE,
      PAYMENT_EVENTS_EXCHANGE,
      ORCHESTRATION_PAYMENT_ROUTING_PATTERN
    )
    await channel.prefetch(8)
    await channel.consume(
      ORCHESTRATION_PAYMENT_QUEUE,
      (msg) => {
        if (!msg) return
        const handle = async (): Promise<void> => {
          try {
            const body = JSON.parse(msg.content.toString('utf-8')) as PaymentEventPayload
            await this.dispatch(body)
            channel.ack(msg)
          } catch (err) {
            this.logger.error(
              `PaymentEventsConsumer 消费失败：${err instanceof Error ? err.message : String(err)}`
            )
            channel.ack(msg)
          }
        }
        void handle()
      },
      { noAck: false }
    )
    this.logger.log(
      `已订阅 ${PAYMENT_EVENTS_EXCHANGE} → ${ORCHESTRATION_PAYMENT_QUEUE} (rk=${ORCHESTRATION_PAYMENT_ROUTING_PATTERN})`
    )
  }
}
