/**
 * @file order-events.publisher.ts
 * @stage P4/T4.23（Sprint 3）
 * @desc 订单事件发布器：RabbitMQ Topic Exchange `o2o.order.events` + InMemory 兜底
 * @author 单 Agent V2.0
 *
 * 双模式（参考 P3 modules/map/rabbitmq/rider-location.publisher.ts）：
 *   - env RABBITMQ_URL 存在 → AmqpOrderEventsPublisher（amqplib，messages persistent）
 *   - 否则 → InMemoryOrderEventsPublisher（仅 logger.log，本地自验证 / 单测）
 *
 * 业务模块约定：
 *   - constructor 注入 ORDER_EVENTS_PUBLISHER 抽象（不耦合具体实现）
 *   - 事件发布 best-effort：失败时只 logger.error，不阻断主业务
 *   - 由 OrderStateMachine.transit 在事务提交后调用；其他 service 直接 publish 也可
 *
 * 不实现：
 *   - 消费者 / 订阅 / 死信（由 Sprint 8 Orchestration 模块接入）
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
import {
  ORDER_EVENTS_EXCHANGE,
  ORDER_EVENTS_EXCHANGE_TYPE,
  ORDER_EVENTS_PUBLISHER,
  buildOrderRoutingKey,
  type OrderEventPayload
} from './order-events.constants'

/* ============================================================================
 * 抽象接口
 * ============================================================================ */

/**
 * 订单事件发布器抽象
 * 用途：所有 service 注入 ORDER_EVENTS_PUBLISHER 拿到本接口实例
 */
export interface OrderEventsPublisher {
  /**
   * 发布一条事件
   * 参数：payload OrderEventPayload（routing key 由 publisher 自动从 eventName 拼装）
   * 返回值：Promise<void>（best-effort，失败不抛）
   */
  publish(payload: OrderEventPayload): Promise<void>
}

/* ============================================================================
 * 实现 1：RabbitMQ（生产）
 * ============================================================================ */

/**
 * AMQP 实现（生产模式）
 *
 * 设计：
 *   - 单 channel 复用；进程退出 close
 *   - assertExchange(o2o.order.events, 'topic', durable=true)
 *   - publish 时 persistent=true + contentType=application/json
 *   - 连接关闭事件：清理 channel/connection 引用，下次 publish 重连
 *   - 写失败仅 logger.error 并吞掉异常（业务主流程不能因 MQ 失败回滚）
 */
@Injectable()
export class AmqpOrderEventsPublisher
  implements OrderEventsPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AmqpOrderEventsPublisher.name)
  private connection?: ChannelModel
  private channel?: Channel
  private readonly url: string

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.url = config.get<string>('rabbitmq.url', '')
  }

  /**
   * 模块启动时尝试连接（无 URL 直接 warn）
   */
  async onModuleInit(): Promise<void> {
    if (!this.url) {
      this.logger.warn(
        'RABBITMQ_URL 未配置，AmqpOrderEventsPublisher 不会真正连接（应使用 InMemory 兜底）'
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

  /**
   * 模块销毁时清理
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
   * 发送事件
   * 参数：payload OrderEventPayload
   * 返回值：void（best-effort）
   */
  async publish(payload: OrderEventPayload): Promise<void> {
    try {
      const channel = await this.ensureChannel()
      const routingKey = buildOrderRoutingKey(payload.eventName)
      const body = Buffer.from(JSON.stringify(payload), 'utf-8')
      const ok = channel.publish(ORDER_EVENTS_EXCHANGE, routingKey, body, {
        persistent: true,
        contentType: 'application/json',
        messageId: `${payload.orderNo}:${payload.eventName}:${payload.occurredAt}`,
        headers: {
          'order-no': payload.orderNo,
          'order-type': payload.orderType,
          'event-name': payload.eventName
        }
      })
      if (!ok) {
        await new Promise<void>((resolve) => channel.once('drain', () => resolve()))
      }
      this.logger.debug(
        `[ORDER-EVENT] published ${routingKey} orderNo=${payload.orderNo} ${payload.fromStatus}→${payload.toStatus}`
      )
    } catch (err) {
      this.logger.error(
        `[ORDER-EVENT] publish 失败 orderNo=${payload.orderNo} event=${payload.eventName}：${(err as Error).message}`
      )
    }
  }

  /**
   * 懒连接 + 声明 exchange
   * 返回值：可用 channel
   */
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
    await channel.assertExchange(ORDER_EVENTS_EXCHANGE, ORDER_EVENTS_EXCHANGE_TYPE, {
      durable: true
    })
    this.channel = channel
    return channel
  }
}

/* ============================================================================
 * 实现 2：InMemory（自验证 / 单测）
 * ============================================================================ */

/**
 * 内存兜底 Publisher
 *
 * 用途：
 *   - RABBITMQ_URL 未配置时使用
 *   - 单元测试时提供 setListener 注入回调
 *
 * 行为：
 *   - 无 listener：仅 logger.log
 *   - 有 listener：直接调用 listener；listener 抛错时 logger.error 但不再抛出
 */
@Injectable()
export class InMemoryOrderEventsPublisher implements OrderEventsPublisher {
  private readonly logger = new Logger(InMemoryOrderEventsPublisher.name)
  private listener: ((payload: OrderEventPayload) => Promise<void> | void) | undefined

  /**
   * 注册回调（测试 / 本地编排用）
   * 参数：listener
   * 返回值：void
   */
  setListener(listener: (payload: OrderEventPayload) => Promise<void> | void): void {
    this.listener = listener
  }

  /**
   * 发送事件（仅日志 + 回调）
   * 参数：payload
   * 返回值：void
   */
  async publish(payload: OrderEventPayload): Promise<void> {
    const routingKey = buildOrderRoutingKey(payload.eventName)
    this.logger.log(
      `[ORDER-EVENT/INMEM] ${routingKey} orderNo=${payload.orderNo} type=${payload.orderType} ${payload.fromStatus}→${payload.toStatus} extra=${JSON.stringify(payload.extra)}`
    )
    if (!this.listener) return
    try {
      await this.listener(payload)
    } catch (err) {
      this.logger.error(
        `[ORDER-EVENT/INMEM] listener 抛错 orderNo=${payload.orderNo}：${(err as Error).message}`
      )
    }
  }
}

/* ============================================================================
 * Provider 工厂
 * ============================================================================ */

/**
 * ORDER_EVENTS_PUBLISHER Provider
 *
 * 设计：
 *   - 有 RABBITMQ_URL → 真 AMQP
 *   - 无 RABBITMQ_URL → InMemory
 *   - 切换运行时无侵入业务代码
 *
 * 用途：order.module（用户后续整合）通过 providers 注入；当前 publisher 文件
 *      只导出 provider，模块装配交给用户。
 */
export const orderEventsPublisherProvider: FactoryProvider<OrderEventsPublisher> = {
  provide: ORDER_EVENTS_PUBLISHER,
  useFactory: (config: ConfigService): OrderEventsPublisher => {
    const url = config.get<string>('rabbitmq.url', '')
    if (url) return new AmqpOrderEventsPublisher(config)
    return new InMemoryOrderEventsPublisher()
  },
  inject: [ConfigService]
}
