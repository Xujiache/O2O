/**
 * @file orchestration.types.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc Orchestration 域共享类型：SagaStep / SagaContext / EventEnvelope / DLQ Job
 * @author 单 Agent V2.0（Subagent 7：Orchestration + 收尾）
 *
 * 设计依据：
 *   - DESIGN_P4 §十 Orchestration（Saga 模式 / 死信补偿）
 *   - CONSENSUS_P4 §2.9 事件总线（OrderEvent / PaymentEvent payload 契约）
 *
 * 与现有发布器对齐：
 *   - OrderEventPayload  来自 modules/order/events/order-events.constants
 *   - PaymentEventPayload 来自 modules/payment/services/payment-events.publisher
 *
 * 使用场景：
 *   - SagaRunner.execute(steps, context) try/catch 每步 → 失败投递 DLQ
 *   - 各 Saga 服务只暴露 handleXxx(payload) 业务函数；不直接订阅事件
 *   - Consumer（AMQP / InMemory）解析 payload → 路由到对应 Saga.handleXxx
 */

import type { OrderEventPayload } from '@/modules/order/events/order-events.constants'
import type { PaymentEventPayload } from '@/modules/payment/services/payment-events.publisher'

/* ============================================================================
 * 1) 事件来源 / 信封
 * ============================================================================ */

/**
 * 事件来源类别（用于 DLQ 报警 / 路由 / 日志）
 *   - order  来自 o2o.order.events Topic Exchange
 *   - payment 来自 o2o.payment.events Topic Exchange
 *   - cron   来自定时任务（如对账修复 Job 调起的 Saga）
 *   - manual 来自管理后台手工补偿
 */
export const EventSourceEnum = {
  ORDER: 'order',
  PAYMENT: 'payment',
  CRON: 'cron',
  MANUAL: 'manual'
} as const

/** 事件来源字面量联合 */
export type EventSource = (typeof EventSourceEnum)[keyof typeof EventSourceEnum]

/**
 * 通用事件信封（用于 SagaRunner / DLQ；既能装 OrderEvent 也能装 PaymentEvent）
 *
 * 字段：
 *   - source     事件源类别（用于路由 + 死信归类）
 *   - eventName  事件名（如 'OrderPaid' / 'PaymentSucceed'）
 *   - body       事件原始 payload（OrderEventPayload | PaymentEventPayload | unknown）
 *   - receivedAt consumer 收到事件的毫秒时间戳
 *   - traceId    跨服务追踪 ID（无则 ''）
 */
export interface EventEnvelope<T = unknown> {
  source: EventSource
  eventName: string
  body: T
  receivedAt: number
  traceId: string
}

/** 订单事件信封（强类型 body） */
export type OrderEventEnvelope = EventEnvelope<OrderEventPayload>

/** 支付事件信封（强类型 body） */
export type PaymentEventEnvelope = EventEnvelope<PaymentEventPayload>

/* ============================================================================
 * 2) Saga 抽象
 * ============================================================================ */

/**
 * Saga 步骤
 *
 * 字段：
 *   - name      步骤名（写日志 / DLQ 报警）
 *   - run       业务执行函数；失败抛 Error
 *   - compensate 可选补偿函数（前置步骤已执行的副作用回滚；当前期实现仅 best-effort 调用）
 */
export interface SagaStep<C = unknown> {
  name: string
  run: (ctx: C) => Promise<void>
  compensate?: (ctx: C) => Promise<void>
}

/**
 * Saga 执行上下文（透传给 step.run / step.compensate）
 *
 * 字段：
 *   - sagaId      雪花字符串（写 DLQ Job + 日志）
 *   - sagaName    Saga 标识（如 'OrderPaidSaga' / 'RefundSucceedSaga'）
 *   - envelope    触发本 Saga 的事件信封
 *   - state       step 之间共享的可写状态（如阶段产出数据）
 *
 * 说明：S 不限定 Record<string,unknown>，避免 interface 类型必须额外加 index signature
 */
export interface SagaContext<S = Record<string, unknown>> {
  sagaId: string
  sagaName: string
  envelope: EventEnvelope
  state: S
}

/**
 * SagaRunner 执行结果
 *
 * 字段：
 *   - sagaId         本次执行 ID
 *   - sagaName       Saga 名
 *   - executedSteps  已成功执行的步骤名（按顺序）
 *   - failedStep     失败步骤名（成功则为 null）
 *   - error          失败原因（成功则为 null）
 *   - compensated    成功补偿数量（仅 failedStep 非 null 时有意义）
 */
export interface SagaRunResult {
  sagaId: string
  sagaName: string
  executedSteps: string[]
  failedStep: string | null
  error: string | null
  compensated: number
}

/* ============================================================================
 * 3) DLQ Job payload
 * ============================================================================ */

/** Orchestration 死信队列名（BullMQ Queue / Processor 公用） */
export const ORCHESTRATION_DLQ_QUEUE = 'orchestration-dlq'

/** DLQ 任务名 */
export const ORCHESTRATION_DLQ_JOB_NAME = 'saga-failed'

/**
 * Saga 失败时投递到 BullMQ orchestration-dlq 的 payload
 *
 * 字段：
 *   - sagaId / sagaName 透传 SagaRunResult
 *   - source / eventName 来自原 envelope，便于运营定位
 *   - body              原始事件 body（JSON 序列化安全）
 *   - failedStep        失败步骤名
 *   - error             失败 message
 *   - executedSteps     失败前已成功的步骤
 *   - failedAt          失败时刻 ms
 *   - retryCount        当前 BullMQ 重试次数（job.attemptsMade，processor 内自填）
 */
export interface OrchestrationDlqJob {
  sagaId: string
  sagaName: string
  source: EventSource
  eventName: string
  body: unknown
  failedStep: string
  error: string
  executedSteps: string[]
  failedAt: number
  retryCount: number
}

/* ============================================================================
 * 4) Consumer 队列名 / Exchange 绑定
 * ============================================================================ */

/** 订单事件订阅队列（绑定 o2o.order.events Topic Exchange）*/
export const ORCHESTRATION_ORDER_QUEUE = 'orchestration.order'

/** 支付事件订阅队列（绑定 o2o.payment.events Topic Exchange）*/
export const ORCHESTRATION_PAYMENT_QUEUE = 'orchestration.payment'

/** 订单事件 routing key 通配（订阅所有 order.* 事件） */
export const ORCHESTRATION_ORDER_ROUTING_PATTERN = 'order.*'

/** 支付事件 routing key 通配 */
export const ORCHESTRATION_PAYMENT_ROUTING_PATTERN = 'payment.*'
