/**
 * @file payment-events.publisher.ts
 * @stage P4/T4.29（Sprint 4）
 * @desc 支付事件发布器：RabbitMQ Topic Exchange `o2o.payment.events` + InMemory 兜底
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 设计参考：modules/order/events/order-events.publisher.ts（同一双模式架构）
 *
 * 拓扑：
 *   Topic Exchange: o2o.payment.events
 *   Routing Key:    payment.${eventName}（如 payment.PaymentSucceed / payment.RefundSucceed）
 *   Consumer 由 Sprint 8 Orchestration 接入；本期只发不订阅
 *
 * 双模式策略：
 *   - env RABBITMQ_URL 存在 → AmqpPaymentEventsPublisher（amqplib，messages persistent）
 *   - 否则 → InMemoryPaymentEventsPublisher（仅 logger.log，本地自验证 / 单测）
 *
 * 调用约定：
 *   - PaymentService / RefundService / PaymentStateMachine 在事务提交后 publish
 *   - 失败 best-effort，仅 logger.error（业务主流程不能因 MQ 失败回滚）
 */

import {
  Inject,
  Injectable,
  Logger,
  type FactoryProvider,
  type OnModuleDestroy,
  type OnModuleInit
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as amqplib from 'amqplib'
import type { Channel, ChannelModel } from 'amqplib'
import type { PaymentEventName } from '../types/payment.types'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** RabbitMQ Topic Exchange 名 */
export const PAYMENT_EVENTS_EXCHANGE = 'o2o.payment.events'

/** Exchange 类型 */
export const PAYMENT_EVENTS_EXCHANGE_TYPE = 'topic'

/** Publisher 注入 token */
export const PAYMENT_EVENTS_PUBLISHER = Symbol('PAYMENT_EVENTS_PUBLISHER')

/**
 * 把事件名 → routing key
 * 参数：eventName 业务事件
 * 返回值：'payment.<eventName>'
 */
export function buildPaymentRoutingKey(eventName: PaymentEventName): string {
  return `payment.${eventName}`
}

/* ============================================================================
 * 事件 payload
 * ============================================================================ */

/**
 * 标准事件 payload
 *
 * 字段：
 *   - eventName     业务事件名
 *   - payNo         平台支付单号
 *   - orderNo       关联订单号
 *   - orderType     订单类型：1 外卖 / 2 跑腿
 *   - userId        付款用户 ID
 *   - amount        本次相关金额（支付额或退款额）
 *   - payMethod     支付方式
 *   - fromStatus    迁移前状态（首次 PaymentCreated 为 null）
 *   - toStatus      迁移后状态
 *   - occurredAt    事件发生 ms 时间戳
 *   - traceId       链路追踪 ID（无则空串）
 *   - extra         业务扩展（如 refundNo / outTradeNo / channel）
 */
export interface PaymentEventPayload {
  eventName: PaymentEventName
  payNo: string
  orderNo: string
  orderType: number
  userId: string
  amount: string
  payMethod: number
  fromStatus: number | null
  toStatus: number
  occurredAt: number
  traceId: string
  extra: Record<string, unknown>
}

/* ============================================================================
 * 抽象接口
 * ============================================================================ */

/**
 * 支付事件发布器抽象
 * 用途：service 注入 PAYMENT_EVENTS_PUBLISHER 拿本接口实例
 */
export interface PaymentEventsPublisher {
  /**
   * 发布一条事件
   * 参数：payload PaymentEventPayload
   * 返回值：Promise<void>（best-effort，失败不抛）
   */
  publish(payload: PaymentEventPayload): Promise<void>
}

/* ============================================================================
 * 实现 1：RabbitMQ
 * ============================================================================ */

@Injectable()
export class AmqpPaymentEventsPublisher
  implements PaymentEventsPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AmqpPaymentEventsPublisher.name)
  private connection?: ChannelModel
  private channel?: Channel
  private readonly url: string

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.url = config.get<string>('rabbitmq.url', '')
  }

  async onModuleInit(): Promise<void> {
    if (!this.url) {
      this.logger.warn(
        'RABBITMQ_URL 未配置，AmqpPaymentEventsPublisher 不会真正连接（应使用 InMemory 兜底）'
      )
      return
    }
    try {
      await this.ensureChannel()
    } catch (err) {
      this.logger.warn(
        `RabbitMQ 初始连接失败：${(err as Error).message}（开发态可忽略，下次 publish 自动重试）`
      )
    }
  }

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

  async publish(payload: PaymentEventPayload): Promise<void> {
    try {
      const channel = await this.ensureChannel()
      const routingKey = buildPaymentRoutingKey(payload.eventName)
      const body = Buffer.from(JSON.stringify(payload), 'utf-8')
      const ok = channel.publish(PAYMENT_EVENTS_EXCHANGE, routingKey, body, {
        persistent: true,
        contentType: 'application/json',
        messageId: `${payload.payNo}:${payload.eventName}:${payload.occurredAt}`,
        headers: {
          'pay-no': payload.payNo,
          'order-no': payload.orderNo,
          'event-name': payload.eventName
        }
      })
      if (!ok) {
        await new Promise<void>((resolve) => channel.once('drain', () => resolve()))
      }
      this.logger.debug(
        `[PAY-EVENT] published ${routingKey} payNo=${payload.payNo} ${payload.fromStatus}→${payload.toStatus}`
      )
    } catch (err) {
      this.logger.error(
        `[PAY-EVENT] publish 失败 payNo=${payload.payNo} event=${payload.eventName}：${(err as Error).message}`
      )
    }
  }

  /** 懒连接 + 声明 exchange */
  private async ensureChannel(): Promise<Channel> {
    if (this.channel) return this.channel
    if (!this.connection) {
      this.connection = await amqplib.connect(this.url)
      this.connection.on('error', (err: Error) =>
        this.logger.error(`amqplib connection error：${err.message}`)
      )
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ 连接关闭')
        this.connection = undefined
        this.channel = undefined
      })
    }
    const channel = await this.connection.createChannel()
    await channel.assertExchange(PAYMENT_EVENTS_EXCHANGE, PAYMENT_EVENTS_EXCHANGE_TYPE, {
      durable: true
    })
    this.channel = channel
    return channel
  }
}

/* ============================================================================
 * 实现 2：InMemory（自验证 / 单测）
 * ============================================================================ */

@Injectable()
export class InMemoryPaymentEventsPublisher implements PaymentEventsPublisher {
  private readonly logger = new Logger(InMemoryPaymentEventsPublisher.name)
  private listener: ((payload: PaymentEventPayload) => Promise<void> | void) | undefined

  /**
   * 注册回调（测试 / 本地编排用）
   * 参数：listener
   * 返回值：void
   */
  setListener(listener: (payload: PaymentEventPayload) => Promise<void> | void): void {
    this.listener = listener
  }

  async publish(payload: PaymentEventPayload): Promise<void> {
    const routingKey = buildPaymentRoutingKey(payload.eventName)
    this.logger.log(
      `[PAY-EVENT/INMEM] ${routingKey} payNo=${payload.payNo} amount=${payload.amount} ${payload.fromStatus}→${payload.toStatus}`
    )
    if (!this.listener) return
    try {
      await this.listener(payload)
    } catch (err) {
      this.logger.error(
        `[PAY-EVENT/INMEM] listener 抛错 payNo=${payload.payNo}：${(err as Error).message}`
      )
    }
  }
}

/* ============================================================================
 * Provider 工厂
 * ============================================================================ */

/**
 * PAYMENT_EVENTS_PUBLISHER Provider
 *
 * 设计：
 *   - 有 RABBITMQ_URL → 真 AMQP
 *   - 无 RABBITMQ_URL → InMemory
 *   - 切换运行时无侵入业务代码
 */
export const paymentEventsPublisherProvider: FactoryProvider<PaymentEventsPublisher> = {
  provide: PAYMENT_EVENTS_PUBLISHER,
  useFactory: (config: ConfigService): PaymentEventsPublisher => {
    const url = config.get<string>('rabbitmq.url', '')
    if (url) return new AmqpPaymentEventsPublisher(config)
    return new InMemoryPaymentEventsPublisher()
  },
  inject: [ConfigService]
}
