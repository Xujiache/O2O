/**
 * @file order-delivered-finish.job.ts
 * @stage P9 Sprint 2 / W2.B.1（P9-P1-04）
 * @desc OrderDelivered → 5min 自动 finished（BullMQ delayed Job）
 * @author 单 Agent V2.0（Sprint 2 Agent B）
 *
 * 设计：
 *   - 队列：'order-delivered-finish'（在 OrderModule.imports 注册）
 *   - 触发：上游（OrderSagaService.runOrderDelivered / RiderActionService.deliver）
 *           调 scheduleAutoFinish(orderNo, orderType) 入队（jobId 幂等）
 *   - 延迟：5min（DELAY_MS）
 *   - 执行：到期 BullMQ Worker 调 process(job) → OrderStateMachine.transit('OrderFinished')
 *           - 当前 status === 50（DELIVERED）→ 推进到 55（FINISHED）；StateMachine 内部
 *             会 publish OrderFinished 事件，下游 SettleSaga 自动接管分账
 *           - status !== 50（已 FINISHED / CANCELED / 售后）→ 静默跳过（log.warn + return）
 *           - 订单不存在（订单号非法 / 物理表缺失）→ log.error + return（不抛 让 BullMQ 不重试）
 *
 * 设计取舍：
 *   - 不重试：状态机已具备幂等保护（transit 内 CAS 检查 fromStatus）；外部重试只会增加 log 噪声
 *   - 5min 是用户体验取舍：太短（1min）会打扰用户主动确认；太长（30min）影响商户结算时效
 */

import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import { OrderStateMachine } from '../state-machine/order-state-machine'
import {
  OrderOpTypeEnum,
  OrderTakeoutStatusEnum,
  OrderTypeEnum,
  type OrderType
} from '../types/order.types'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** BullMQ 队列名 */
export const ORDER_DELIVERED_FINISH_QUEUE = 'order-delivered-finish'

/** Job name */
export const ORDER_DELIVERED_FINISH_JOB_NAME = 'auto-finish-after-5min'

/** 延迟时长：5 分钟 */
export const ORDER_DELIVERED_FINISH_DELAY_MS = 5 * 60 * 1000

/** Job payload */
export interface OrderDeliveredFinishJobPayload {
  /** 18 位订单号 */
  orderNo: string
  /** 订单类型：1 外卖 / 2 跑腿 */
  orderType: OrderType
}

/** process 返回结构 */
export interface OrderDeliveredFinishResult {
  skipped?: boolean
  finished?: boolean
  reason?: string
}

/* ============================================================================
 * Job
 * ============================================================================ */

/**
 * OrderDelivered 5min 自动 finished Job
 *
 * 同时是：
 *   1) Producer：scheduleAutoFinish 入队
 *   2) Worker：process 消费
 */
@Processor(ORDER_DELIVERED_FINISH_QUEUE)
@Injectable()
export class OrderDeliveredFinishJob extends WorkerHost {
  private readonly logger = new Logger(OrderDeliveredFinishJob.name)

  constructor(
    @InjectQueue(ORDER_DELIVERED_FINISH_QUEUE)
    private readonly queue: Queue<OrderDeliveredFinishJobPayload>,
    private readonly stateMachine: OrderStateMachine
  ) {
    super()
  }

  /**
   * 入队 Producer：上游（saga / rider-action）调用
   * 参数：orderNo / orderType
   * 返回值：void
   * 行为：
   *   - jobId 'auto-finish:{orderNo}' 保证同一订单多次入队幂等（重复 add 被 BullMQ 覆盖）
   *   - removeOnComplete 1day / removeOnFail 3day：限制 Redis 占用
   *   - 失败也仅 log；上游业务流不应被该 best-effort 入队失败影响
   */
  async scheduleAutoFinish(orderNo: string, orderType: OrderType): Promise<void> {
    if (!orderNo || orderNo.length !== 18) {
      this.logger.warn(`[scheduleAutoFinish] 非法 orderNo=${orderNo}，跳过入队`)
      return
    }
    try {
      await this.queue.add(
        ORDER_DELIVERED_FINISH_JOB_NAME,
        { orderNo, orderType },
        {
          delay: ORDER_DELIVERED_FINISH_DELAY_MS,
          jobId: `auto-finish:${orderNo}`,
          attempts: 1,
          removeOnComplete: { age: 24 * 3600 },
          removeOnFail: { age: 3 * 24 * 3600 }
        }
      )
      this.logger.log(
        `[scheduleAutoFinish] orderNo=${orderNo} type=${orderType} 5min 后自动 finished`
      )
    } catch (err) {
      this.logger.error(
        `[scheduleAutoFinish] 入队失败 orderNo=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * BullMQ Worker process（到期触发）
   * 参数：job Job<OrderDeliveredFinishJobPayload>
   * 返回值：OrderDeliveredFinishResult
   * 行为：
   *   1) 取当前 status；非 50（DELIVERED）→ 跳过
   *   2) 调状态机 transit('OrderFinished')；50→55；publish OrderFinished 事件
   *   3) 任意异常 → 仅 log error 不抛（避免 BullMQ 重试堆积）
   */
  async process(job: Job<OrderDeliveredFinishJobPayload>): Promise<OrderDeliveredFinishResult> {
    const { orderNo, orderType } = job.data
    if (!orderNo || !orderType) {
      this.logger.warn(`[PROC] job ${job.id} 缺少 orderNo / orderType，跳过`)
      return { skipped: true, reason: 'invalid_payload' }
    }

    /* 1) 取当前状态 */
    let currentStatus: number
    try {
      currentStatus = await this.stateMachine.getCurrentStatus(orderNo, orderType)
    } catch (err) {
      this.logger.error(
        `[PROC] 取当前状态失败 orderNo=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return { skipped: true, reason: 'order_not_found' }
    }

    /* 2) 非 DELIVERED 直接跳过（已确认 / 已取消 / 售后中） */
    if (currentStatus !== OrderTakeoutStatusEnum.DELIVERED) {
      this.logger.warn(
        `[PROC] orderNo=${orderNo} status=${currentStatus} 非 DELIVERED(50)，跳过自动 finished`
      )
      return { skipped: true, reason: `status_${currentStatus}` }
    }

    /* 3) 推进到 FINISHED */
    try {
      const result = await this.stateMachine.transit(orderNo, orderType, 'OrderFinished', {
        opType: OrderOpTypeEnum.SYSTEM,
        opId: null,
        remark: '5min 自动确认',
        additionalFields: { finishedAt: new Date() },
        eventPayloadExtra: { autoFinishedAfterMs: ORDER_DELIVERED_FINISH_DELAY_MS }
      })
      this.logger.log(
        `[PROC] auto-finished orderNo=${orderNo} ${result.fromStatus}→${result.toStatus} log=${result.statusLogId}`
      )
      return { finished: true }
    } catch (err) {
      this.logger.error(
        `[PROC] 推进 OrderFinished 失败 orderNo=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return { skipped: true, reason: 'transit_failed' }
    }
  }

  /**
   * 暴露 OrderTypeEnum 给上游调用方便（避免重复 import）
   */
  static readonly ORDER_TYPE = OrderTypeEnum
}
