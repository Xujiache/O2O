/**
 * @file saga-runner.service.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc Saga 执行器：try/catch 每步 → 失败投递 DLQ + 反向补偿
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 设计：
 *   - 顺序执行 SagaStep 数组；每步 try/catch
 *   - 任一步失败 → 反向遍历已执行的 step 调 compensate（best-effort，吞异常仅 warn）
 *   - 失败 → 把失败信息投递 BullMQ orchestration-dlq（保留 7 天，由人工或定时任务复查）
 *   - 全部成功 → 返回 SagaRunResult.failedStep=null
 *
 * 不实现：
 *   - 自动重试（DLQ processor 内决定是否重投）
 *   - 持久化 saga state（本期 in-memory，过程数据保留在 ctx.state）
 */

import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { SnowflakeId } from '@/utils'
import {
  ORCHESTRATION_DLQ_JOB_NAME,
  ORCHESTRATION_DLQ_QUEUE,
  type EventEnvelope,
  type OrchestrationDlqJob,
  type SagaContext,
  type SagaRunResult,
  type SagaStep
} from '../types/orchestration.types'

/**
 * SagaRunner：执行 Saga 步骤序列 + 失败时落 DLQ
 */
@Injectable()
export class SagaRunnerService {
  private readonly logger = new Logger(SagaRunnerService.name)

  constructor(
    @InjectQueue(ORCHESTRATION_DLQ_QUEUE) private readonly dlqQueue: Queue<OrchestrationDlqJob>
  ) {}

  /**
   * 执行 Saga
   *
   * 参数：
   *   - sagaName  Saga 标识（DLQ 报警 + 日志）
   *   - envelope  触发本 Saga 的事件信封
   *   - steps     步骤数组（按顺序执行）
   *   - initialState 可选共享状态初值
   * 返回值：SagaRunResult
   *
   * 行为：
   *   1. 顺序 step.run；每步前打 debug 日志
   *   2. 任一步抛错 → 反向 compensate 已成功步骤
   *   3. 投递 OrchestrationDlqJob 到 BullMQ orchestration-dlq
   *   4. 不向上抛业务异常（best-effort consumer 模式）
   */
  async execute<S = Record<string, unknown>>(
    sagaName: string,
    envelope: EventEnvelope,
    steps: SagaStep<SagaContext<S>>[],
    initialState?: S
  ): Promise<SagaRunResult> {
    const sagaId = SnowflakeId.next()
    const ctx: SagaContext<S> = {
      sagaId,
      sagaName,
      envelope,
      state: (initialState ?? ({} as S)) as S
    }
    const executedSteps: string[] = []

    for (const step of steps) {
      try {
        this.logger.debug(
          `[SAGA] start step=${step.name} saga=${sagaName} id=${sagaId} event=${envelope.eventName}`
        )
        await step.run(ctx)
        executedSteps.push(step.name)
        this.logger.debug(`[SAGA] ok step=${step.name} saga=${sagaName} id=${sagaId}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.error(
          `[SAGA] FAIL step=${step.name} saga=${sagaName} id=${sagaId} event=${envelope.eventName} error=${message}`
        )

        const compensated = await this.compensateInReverse(steps, executedSteps, ctx)
        await this.enqueueDlq({
          sagaId,
          sagaName,
          source: envelope.source,
          eventName: envelope.eventName,
          body: this.safeJson(envelope.body),
          failedStep: step.name,
          error: message,
          executedSteps: [...executedSteps],
          failedAt: Date.now(),
          retryCount: 0
        })

        return {
          sagaId,
          sagaName,
          executedSteps,
          failedStep: step.name,
          error: message,
          compensated
        }
      }
    }

    this.logger.log(
      `[SAGA] DONE saga=${sagaName} id=${sagaId} event=${envelope.eventName} steps=${executedSteps.length}`
    )
    return {
      sagaId,
      sagaName,
      executedSteps,
      failedStep: null,
      error: null,
      compensated: 0
    }
  }

  /**
   * 反向调用已成功步骤的 compensate（best-effort，吞异常仅 warn）
   * 参数：
   *   - allSteps     原始步骤数组（用于按 name 找到 compensate 函数）
   *   - executedNames 已成功步骤名顺序
   *   - ctx          上下文
   * 返回值：实际成功补偿的步骤数
   */
  private async compensateInReverse<S>(
    allSteps: SagaStep<SagaContext<S>>[],
    executedNames: string[],
    ctx: SagaContext<S>
  ): Promise<number> {
    let count = 0
    const stepsByName = new Map(allSteps.map((s) => [s.name, s]))
    for (let i = executedNames.length - 1; i >= 0; i--) {
      const name = executedNames[i]
      if (!name) continue
      const step = stepsByName.get(name)
      if (!step?.compensate) continue
      try {
        await step.compensate(ctx)
        count += 1
        this.logger.warn(`[SAGA-COMPENSATE] ok step=${name} saga=${ctx.sagaName} id=${ctx.sagaId}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(
          `[SAGA-COMPENSATE] fail step=${name} saga=${ctx.sagaName} id=${ctx.sagaId} err=${msg}`
        )
      }
    }
    return count
  }

  /**
   * 投递 DLQ Job（best-effort，吞 BullMQ 异常）
   * 参数：job DLQ 任务体
   * 返回值：void
   */
  private async enqueueDlq(job: OrchestrationDlqJob): Promise<void> {
    try {
      await this.dlqQueue.add(ORCHESTRATION_DLQ_JOB_NAME, job, {
        removeOnComplete: { age: 7 * 24 * 3600 },
        removeOnFail: { age: 14 * 24 * 3600 },
        attempts: 1
      })
    } catch (err) {
      this.logger.error(
        `[SAGA-DLQ] 投递失败 saga=${job.sagaName} id=${job.sagaId}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 安全 JSON 化 envelope.body（避免循环引用 / 函数引用造成 BullMQ 序列化报错）
   * 参数：input 任意值
   * 返回值：可序列化的对象（失败时返回 null）
   */
  private safeJson(input: unknown): unknown {
    try {
      return JSON.parse(JSON.stringify(input))
    } catch {
      return null
    }
  }
}
