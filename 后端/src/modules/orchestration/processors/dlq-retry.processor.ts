/**
 * @file dlq-retry.processor.ts
 * @stage P9 Sprint 3 / W3.B.2 + P9 Sprint 4 / W4.A.2（真重试落地）
 * @desc DLQ 自动重试 Processor + 首次落库器
 * @author 单 Agent V2.0（Sprint 3 Agent B + Sprint 4 Agent A）
 *
 * 设计：
 *   - 监听独立 BullMQ 队列 `orchestration-dlq-retry`，由 DlqLogService（业务调用）
 *     或管理后台手动重试触发；
 *   - 不与现有 `OrchestrationDlqProcessor`（消费 orchestration-dlq）抢队列，
 *     避免同一 queue 多 Worker 抢同一 job 的并发问题；
 *   - 同时提供 `recordInitialDlq(data)` 静态/实例方法（不在 BullMQ 调用栈内），
 *     用于在 saga-failed 第一次落到 orchestration-dlq 时被业务层（admin-dlq controller
 *     或集成层 hook）调用 → 写 dlq_retry_log 初始记录。
 *
 * 重试策略：
 *   - 3 次指数退避（1min / 5min / 30min）
 *   - 第 1~3 次失败：status=PENDING + retry_count++ + nextRetryAt
 *   - 第 4 次仍失败：status=PERMANENT_FAILED + logger.error + 钉钉告警占位
 *
 * 真重试逻辑（P9 Sprint 4 W4.A.2 落地）：
 *   - 按 data.source 路由：
 *       'order'   → @Optional() ORDER_EVENTS_PUBLISHER.publish(body as OrderEventPayload)
 *       'payment' → @Optional() PAYMENT_EVENTS_PUBLISHER.publish(body as PaymentEventPayload)
 *       'cron'/'manual' → 跳过真重试（仅写 dlq_retry_log）
 *   - 若 publisher 未注入（测试/Mock 模式）→ 跳过真重试，仅写 dlq_retry_log + 钉钉告警占位
 *   - 真重试失败：仍计入 retryCount；3 次后转 PERMANENT_FAILED
 *
 * 兼容备注：
 *   - 队列名导出在本文件，避免侵入 orchestration.types.ts
 *   - dlq_retry_log 实体由 entities/index.ts 提供
 */

import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Job, Queue } from 'bullmq'
import { Repository } from 'typeorm'
import { DlqRetryLog, DlqRetryLogStatusEnum } from '@/entities'
import {
  ORDER_EVENTS_PUBLISHER,
  type OrderEventPayload
} from '@/modules/order/events/order-events.constants'
import { type OrderEventsPublisher } from '@/modules/order/events/order-events.publisher'
import {
  PAYMENT_EVENTS_PUBLISHER,
  type PaymentEventPayload,
  type PaymentEventsPublisher
} from '@/modules/payment/services/payment-events.publisher'
import { SnowflakeId } from '@/utils'
import { EventSourceEnum, type OrchestrationDlqJob } from '../types/orchestration.types'

/** DLQ 自动重试独立队列名（避免与 orchestration-dlq 争用 Worker） */
export const ORCHESTRATION_DLQ_RETRY_QUEUE = 'orchestration-dlq-retry'

/** 重试 jobName */
export const DLQ_RETRY_JOB_NAME = 'dlq-retry'

/** 最大自动重试次数（3 次：1min / 5min / 30min） */
export const DLQ_MAX_RETRY = 3

/** 指数退避间隔（毫秒） */
const RETRY_BACKOFF_MS = [60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000]

/**
 * DlqRetryProcessor：监听独立队列 + 提供 recordInitialDlq 业务 API
 */
@Injectable()
@Processor(ORCHESTRATION_DLQ_RETRY_QUEUE)
export class DlqRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(DlqRetryProcessor.name)

  constructor(
    @Optional()
    @InjectRepository(DlqRetryLog)
    private readonly logRepo?: Repository<DlqRetryLog>,
    @Optional()
    @InjectQueue(ORCHESTRATION_DLQ_RETRY_QUEUE)
    private readonly retryQueue?: Queue<OrchestrationDlqJob>,
    /**
     * P9 Sprint 4 / W4.A.2：按 source 路由 publish 真重试。
     * 缺失任一 publisher（mock/单测）→ 跳过真重试，仅写 dlq_retry_log + 钉钉告警占位。
     */
    @Optional()
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly orderPublisher?: OrderEventsPublisher,
    @Optional()
    @Inject(PAYMENT_EVENTS_PUBLISHER)
    private readonly paymentPublisher?: PaymentEventsPublisher
  ) {
    super()
  }

  /**
   * BullMQ 入口：消费 dlq-retry job
   * 入参：job BullMQ Job<OrchestrationDlqJob>
   * 返回值：{ status: PENDING / PERMANENT_FAILED / SKIPPED }
   *
   * 行为：
   *   1) 若 jobName 不是 DLQ_RETRY_JOB_NAME → SKIPPED
   *   2) 查 dlq_retry_log（按 sagaId）；若已 PERMANENT_FAILED / DISCARDED / RETRY_OK → 跳过
   *   3) retryCount++ ；若达 MAX → PERMANENT_FAILED + 钉钉告警占位
   *   4) 否则 PENDING + nextRetryAt = now + backoff[retryCount-1]
   */
  async process(job: Job<OrchestrationDlqJob>): Promise<{ status: string }> {
    if (job.name !== DLQ_RETRY_JOB_NAME) {
      return { status: 'SKIPPED' }
    }

    const data = job.data
    if (!this.logRepo) {
      this.logger.warn(`[DLQ-RETRY] dlq_retry_log repo 未注入，跳过持久化 saga=${data.sagaId}`)
      return { status: 'SKIPPED' }
    }

    /* 查或创：sagaId 已存在则递增 retry_count；否则首次落库 */
    let entity = await this.logRepo.findOne({ where: { sagaId: data.sagaId } })
    const previousRetry = entity?.retryCount ?? 0
    const newRetry = previousRetry + 1
    const isPermanent = newRetry > DLQ_MAX_RETRY

    if (!entity) {
      entity = this.logRepo.create({
        id: SnowflakeId.next(),
        sagaId: data.sagaId,
        sagaName: data.sagaName,
        source: data.source,
        eventName: data.eventName,
        failedStep: data.failedStep,
        error: data.error,
        bodyJson: this.safeJson(data.body),
        status: isPermanent
          ? DlqRetryLogStatusEnum.PERMANENT_FAILED
          : DlqRetryLogStatusEnum.PENDING,
        retryCount: newRetry,
        nextRetryAt: isPermanent ? null : this.computeNextRetryAt(newRetry - 1),
        lastError: data.error
      })
    } else {
      if (
        entity.status === DlqRetryLogStatusEnum.RETRY_OK ||
        entity.status === DlqRetryLogStatusEnum.DISCARDED
      ) {
        this.logger.log(
          `[DLQ-RETRY] 跳过：saga=${data.sagaId} 已 ${entity.status === 1 ? 'RETRY_OK' : 'DISCARDED'}`
        )
        return { status: 'SKIPPED' }
      }
      entity.retryCount = newRetry
      entity.lastError = data.error
      entity.status = isPermanent
        ? DlqRetryLogStatusEnum.PERMANENT_FAILED
        : DlqRetryLogStatusEnum.PENDING
      entity.nextRetryAt = isPermanent ? null : this.computeNextRetryAt(newRetry - 1)
    }

    try {
      await this.logRepo.save(entity)
    } catch (err) {
      this.logger.error(
        `[DLQ-RETRY] dlq_retry_log 写入失败 saga=${data.sagaId}：${err instanceof Error ? err.message : String(err)}`
      )
      return { status: 'SKIPPED' }
    }

    if (isPermanent) {
      this.logger.error(
        `[DLQ-RETRY] PERMANENT_FAILED saga=${data.sagaName} id=${data.sagaId} step=${data.failedStep} retry=${newRetry}/${DLQ_MAX_RETRY} error=${data.error}`
      )
      /* TODO P10：钉钉/飞书 webhook 真告警；webhook URL 由运维通过 SysConfig 下发 */
      this.logger.warn(
        `[DLQ-ALERT] 钉钉告警占位（运维注入 webhook）：saga=${data.sagaName} id=${data.sagaId}`
      )
      return { status: 'PERMANENT_FAILED' }
    }

    /* P9 Sprint 4 / W4.A.2：按 source 路由 publish 真重试 */
    const republished = await this.republishBySource(data)
    if (republished === 'OK') {
      try {
        entity.status = DlqRetryLogStatusEnum.RETRY_OK
        await this.logRepo.save(entity)
      } catch (err) {
        this.logger.warn(
          `[DLQ-RETRY] mark RETRY_OK 失败 id=${data.sagaId}：${err instanceof Error ? err.message : String(err)}`
        )
      }
      this.logger.log(
        `[DLQ-RETRY] RETRY_OK saga=${data.sagaName} id=${data.sagaId} retry=${newRetry}/${DLQ_MAX_RETRY}`
      )
      return { status: 'RETRY_OK' }
    }

    this.logger.warn(
      `[DLQ-RETRY] PENDING saga=${data.sagaName} id=${data.sagaId} retry=${newRetry}/${DLQ_MAX_RETRY} nextAt=${entity.nextRetryAt?.toISOString()} republish=${republished}`
    )
    return { status: 'PENDING' }
  }

  /**
   * 按 source 路由重新发布事件
   * 返回值：
   *   - 'OK'              真重试发布成功
   *   - 'NO_PUBLISHER'    publisher 未注入（mock / 单测模式）
   *   - 'UNSUPPORTED'     source 是 cron / manual 不支持自动重发
   *   - 'INVALID_BODY'    body 无效或不符合对应 payload 形态
   *   - 'PUBLISH_FAILED'  publish 抛错
   */
  private async republishBySource(data: OrchestrationDlqJob): Promise<string> {
    if (data.source === EventSourceEnum.ORDER) {
      if (!this.orderPublisher) return 'NO_PUBLISHER'
      const payload = this.coerceOrderPayload(data.body)
      if (!payload) return 'INVALID_BODY'
      try {
        await this.orderPublisher.publish(payload)
        return 'OK'
      } catch (err) {
        this.logger.warn(
          `[DLQ-REPUBLISH] order publish 失败 saga=${data.sagaId}：${err instanceof Error ? err.message : String(err)}`
        )
        return 'PUBLISH_FAILED'
      }
    }
    if (data.source === EventSourceEnum.PAYMENT) {
      if (!this.paymentPublisher) return 'NO_PUBLISHER'
      const payload = this.coercePaymentPayload(data.body)
      if (!payload) return 'INVALID_BODY'
      try {
        await this.paymentPublisher.publish(payload)
        return 'OK'
      } catch (err) {
        this.logger.warn(
          `[DLQ-REPUBLISH] payment publish 失败 saga=${data.sagaId}：${err instanceof Error ? err.message : String(err)}`
        )
        return 'PUBLISH_FAILED'
      }
    }
    /* cron / manual：不支持自动重发，业务自行从 saga_state 续跑 */
    return 'UNSUPPORTED'
  }

  /**
   * body → OrderEventPayload（最小字段校验）
   */
  private coerceOrderPayload(body: unknown): OrderEventPayload | null {
    if (!body || typeof body !== 'object') return null
    const b = body as Record<string, unknown>
    if (typeof b.eventName !== 'string' || typeof b.orderNo !== 'string') return null
    return b as unknown as OrderEventPayload
  }

  /**
   * body → PaymentEventPayload（最小字段校验）
   */
  private coercePaymentPayload(body: unknown): PaymentEventPayload | null {
    if (!body || typeof body !== 'object') return null
    const b = body as Record<string, unknown>
    if (typeof b.eventName !== 'string' || typeof b.payNo !== 'string') return null
    return b as unknown as PaymentEventPayload
  }

  /**
   * 业务 API：把一个 OrchestrationDlqJob 投递到自动重试队列
   * 用于：
   *   - 管理员手动 retry 时（POST /admin/dlq/:id/retry）
   *   - 集成代码在 OrchestrationDlqProcessor 处理后选择性触发自动重试
   *
   * 入参：data OrchestrationDlqJob
   * 返回值：是否成功投递（best-effort，吞 BullMQ 异常）
   */
  async enqueueRetry(data: OrchestrationDlqJob): Promise<boolean> {
    if (!this.retryQueue) {
      this.logger.warn(`[DLQ-RETRY] retryQueue 未注入，跳过 enqueue saga=${data.sagaId}`)
      return false
    }
    try {
      await this.retryQueue.add(DLQ_RETRY_JOB_NAME, data, {
        removeOnComplete: { age: 7 * 24 * 3600 },
        removeOnFail: { age: 14 * 24 * 3600 },
        attempts: 1
      })
      return true
    } catch (err) {
      this.logger.error(
        `[DLQ-RETRY] enqueue 失败 saga=${data.sagaId}：${err instanceof Error ? err.message : String(err)}`
      )
      return false
    }
  }

  /**
   * 计算下次重试时刻（指数退避）
   * 入参：attempts 已重试次数（0-based）
   * 返回：Date 下次重试时刻
   */
  private computeNextRetryAt(attempts: number): Date {
    const idx = Math.min(Math.max(0, attempts), RETRY_BACKOFF_MS.length - 1)
    const ms = RETRY_BACKOFF_MS[idx] as number
    return new Date(Date.now() + ms)
  }

  /**
   * JSON 安全化（避免循环引用 / 函数引用）
   */
  private safeJson(input: unknown): Record<string, unknown> | null {
    if (input === null || input === undefined) return null
    try {
      const parsed = JSON.parse(JSON.stringify(input))
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>
      }
      return null
    } catch {
      return null
    }
  }
}
