/**
 * @file order-events.consumer.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc AMQP 订阅 o2o.order.events Topic Exchange → 路由到 OrderSaga / SettleSaga
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 拓扑：
 *   Exchange: o2o.order.events (topic, durable)
 *   Queue:    orchestration.order
 *   Binding:  routingKey = 'order.*'
 *   Prefetch: 8
 *
 * 行为：
 *   1. RABBITMQ_URL 缺失 → 不连接（InMemory 模式由 in-memory-events.consumer.ts 接管）
 *   2. 收到 message：
 *      - JSON.parse → OrderEventPayload
 *      - 路由：OrderFinished → SettleSaga；其他 → OrderSaga
 *      - Saga 执行已包含 try/catch + DLQ；本 consumer 始终 ack（避免 nack 循环）
 *   3. 进程销毁：close channel + connection
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
  ORDER_EVENTS_EXCHANGE,
  ORDER_EVENTS_EXCHANGE_TYPE,
  type OrderEventPayload
} from '@/modules/order/events/order-events.constants'
import { OrderSagaService } from '../sagas/order-saga.service'
import { SettleSagaService } from '../sagas/settle-saga.service'
import {
  EventSourceEnum,
  ORCHESTRATION_ORDER_QUEUE,
  ORCHESTRATION_ORDER_ROUTING_PATTERN,
  type OrderEventEnvelope
} from '../types/orchestration.types'

@Injectable()
export class OrderEventsConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OrderEventsConsumer.name)
  private connection?: ChannelModel
  private channel?: Channel
  private readonly amqpUrl: string

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    private readonly orderSaga: OrderSagaService,
    private readonly settleSaga: SettleSagaService
  ) {
    this.amqpUrl = config.get<string>('rabbitmq.url', '')
  }

  /**
   * 启动 AMQP 订阅；URL 缺失时降级 InMemory（由 InMemoryEventsConsumer 处理）
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.amqpUrl) {
      this.logger.warn(
        'RABBITMQ_URL 未配置，OrderEventsConsumer 不订阅；InMemory 模式由 in-memory-events.consumer 接管'
      )
      return
    }
    try {
      await this.startAmqpConsumer()
    } catch (err) {
      this.logger.warn(
        `OrderEventsConsumer 启动失败：${err instanceof Error ? err.message : String(err)}（开发态可忽略）`
      )
    }
  }

  /**
   * 销毁：close channel + connection
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
   * 处理一条事件（Public：供 InMemory consumer 直接调用 / 单测注入）
   * 参数：payload OrderEventPayload
   * 返回值：void（Saga 内部捕获错误并落 DLQ）
   */
  async dispatch(payload: OrderEventPayload): Promise<void> {
    const envelope: OrderEventEnvelope = {
      source: EventSourceEnum.ORDER,
      eventName: payload.eventName,
      body: payload,
      receivedAt: Date.now(),
      traceId: payload.traceId ?? ''
    }
    if (payload.eventName === 'OrderFinished') {
      await this.settleSaga.handleOrderFinished(envelope)
      return
    }
    await this.orderSaga.handleOrderEvent(envelope)
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
      this.logger.warn('OrderEventsConsumer RabbitMQ 连接关闭')
      this.connection = undefined
      this.channel = undefined
    })
    const channel = await this.connection.createChannel()
    this.channel = channel
    await channel.assertExchange(ORDER_EVENTS_EXCHANGE, ORDER_EVENTS_EXCHANGE_TYPE, {
      durable: true
    })
    await channel.assertQueue(ORCHESTRATION_ORDER_QUEUE, { durable: true })
    await channel.bindQueue(
      ORCHESTRATION_ORDER_QUEUE,
      ORDER_EVENTS_EXCHANGE,
      ORCHESTRATION_ORDER_ROUTING_PATTERN
    )
    await channel.prefetch(8)
    await channel.consume(
      ORCHESTRATION_ORDER_QUEUE,
      (msg) => {
        if (!msg) return
        const handle = async (): Promise<void> => {
          try {
            const body = JSON.parse(msg.content.toString('utf-8')) as OrderEventPayload
            await this.dispatch(body)
            channel.ack(msg)
          } catch (err) {
            this.logger.error(
              `OrderEventsConsumer 消费失败：${err instanceof Error ? err.message : String(err)}`
            )
            /* Saga 内部已落 DLQ，这里仍 ack 避免无意义重试 */
            channel.ack(msg)
          }
        }
        void handle()
      },
      { noAck: false }
    )
    this.logger.log(
      `已订阅 ${ORDER_EVENTS_EXCHANGE} → ${ORCHESTRATION_ORDER_QUEUE} (rk=${ORCHESTRATION_ORDER_ROUTING_PATTERN})`
    )
  }
}
