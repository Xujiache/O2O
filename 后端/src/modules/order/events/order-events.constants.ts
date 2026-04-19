/**
 * @file order-events.constants.ts
 * @stage P4/T4.23（Sprint 3）
 * @desc 订单事件总线常量：事件名 + RabbitMQ exchange + routing key + 注入 token
 * @author 单 Agent V2.0
 *
 * 设计依据：
 *   - CONSENSUS_P4 §2.9 事件总线 / DESIGN_P4 §十 Orchestration
 *   - 参考 P3 modules/map/rabbitmq/rider-location.publisher.ts 的双模式落地
 *
 * 拓扑：
 *   Topic Exchange: o2o.order.events
 *   Routing Key:    order.${eventName}（如 order.OrderCreated）
 *   Consumer 由 Sprint 8 Orchestration 接入；本期只发不订阅
 */

import type { OrderEventName, OrderType } from '../types/order.types'

/**
 * RabbitMQ Topic Exchange 名（用户给定）
 * 用途：AmqpOrderEventsPublisher.assertExchange + publish
 */
export const ORDER_EVENTS_EXCHANGE = 'o2o.order.events'

/**
 * RabbitMQ Topic Exchange 类型
 * 用途：assertExchange 第二参数；统一固定 topic
 */
export const ORDER_EVENTS_EXCHANGE_TYPE = 'topic'

/**
 * 业务事件全集（与 types/order.types.ts OrderEventName 完全对齐）
 * 用途：runtime 校验（防止 publish 不在白名单内的事件名）+ 测试穷举
 */
export const ORDER_EVENT_NAMES: ReadonlyArray<OrderEventName> = [
  'OrderCreated',
  'OrderPaid',
  'OrderAccepted',
  'OrderRejected',
  'OrderReady',
  'OrderPicked',
  'OrderDelivered',
  'OrderFinished',
  'OrderCanceled'
]

/**
 * 把事件名 → routing key
 * 参数：eventName 业务事件
 * 返回值：'order.<eventName>'
 * 用途：publish(channel, exchange, routingKey, body)
 */
export function buildOrderRoutingKey(eventName: OrderEventName): string {
  return `order.${eventName}`
}

/**
 * Publisher 注入 token（与 InMemory / Amqp 实现解耦）
 * 用途：业务 service constructor `@Inject(ORDER_EVENTS_PUBLISHER)`
 */
export const ORDER_EVENTS_PUBLISHER = Symbol('ORDER_EVENTS_PUBLISHER')

/**
 * 事件标准 payload
 *
 * 字段：
 *   - eventName    订单事件名
 *   - orderNo      18 位订单号
 *   - orderType    1 外卖 / 2 跑腿
 *   - fromStatus   迁移前状态（首次 OrderCreated 为 null）
 *   - toStatus     迁移后状态
 *   - occurredAt   事件发生毫秒时间戳（事务提交时刻）
 *   - traceId      链路追踪 ID（无则空串）
 *   - extra        业务自定义扩展（如 cancelReason / refundReason / payNo / payMethod）
 */
export interface OrderEventPayload {
  eventName: OrderEventName
  orderNo: string
  orderType: OrderType
  fromStatus: number | null
  toStatus: number
  occurredAt: number
  traceId: string
  extra: Record<string, unknown>
}
