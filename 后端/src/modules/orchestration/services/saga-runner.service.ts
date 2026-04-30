/**
 * @file saga-runner.service.ts
 * @stage P4/T4.49（Sprint 8）+ P9 Sprint 2 / W2.B.2（P9-P1-09）
 * @desc Saga 执行器：try/catch 每步 → 失败投递 DLQ + 反向补偿；P9 起持久化 saga 进度到 saga_state 表
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 设计：
 *   - 顺序执行 SagaStep 数组；每步 try/catch
 *   - 任一步失败 → 反向遍历已执行的 step 调 compensate（best-effort，吞异常仅 warn）
 *   - 失败 → 把失败信息投递 BullMQ orchestration-dlq（保留 7 天，由人工或定时任务复查）
 *   - 全部成功 → 返回 SagaRunResult.failedStep=null
 *
 * P9 持久化（最佳努力，吞异常）：
 *   - 启动 saga：sagaState.create（status=0）
 *   - 每步成功后：sagaState.save({ stepIdx, context })
 *   - 全部完成：sagaState.markCompleted
 *   - 任一步失败：sagaState.markFailed
 *   - 启动时（OnApplicationBootstrap）：findStuckSagas → 仅 log 不自动续跑
 *
 * 不实现：
 *   - 自动重试（DLQ processor 内决定是否重投）
 *   - 自动续跑卡住的 saga（避免业务幂等性风险，仅 log 由运维人工介入）
 */

import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common'
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
import { SagaStateService } from './saga-state.service'

/**
 * SagaRunner：执行 Saga 步骤序列 + 失败时落 DLQ + P9 起把进度持久化到 saga_state
 */
@Injectable()
export class SagaRunnerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SagaRunnerService.name)

  constructor(
    @InjectQueue(ORCHESTRATION_DLQ_QUEUE) private readonly dlqQueue: Queue<OrchestrationDlqJob>,
    @Optional() private readonly sagaStateService?: SagaStateService
  ) {}

  /**
   * 应用启动钩子：扫描 status=0 且 updated_at < now-5min 的卡住 saga
   * 行为：仅 log + 写运维告警，不自动续跑（避免业务幂等性风险）
   * SagaStateService 缺失时（旧测试 / mock 模式）跳过
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.sagaStateService) return
    try {
      const stuck = await this.sagaStateService.findStuckSagas()
      if (stuck.length > 0) {
        this.logger.warn(
          `[SAGA-BOOTSTRAP] 发现 ${stuck.length} 个卡住的 saga（status=0 且 updated_at < now-5min），人工介入：${stuck
            .map((s) => `${s.sagaType}#${s.sagaId}@step${s.stepIdx}`)
            .join(', ')}`
        )
      } else {
        this.logger.log('[SAGA-BOOTSTRAP] 无卡住 saga')
      }
    } catch (err) {
      this.logger.warn(
        `[SAGA-BOOTSTRAP] 扫描 stuck saga 失败（DB 未就绪？）：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

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

    /* P9：持久化 saga 启动状态（best-effort） */
    await this.persistCreate(sagaId, sagaName, envelope, ctx.state as Record<string, unknown>)

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!
      try {
        this.logger.debug(
          `[SAGA] start step=${step.name} saga=${sagaName} id=${sagaId} event=${envelope.eventName}`
        )
        /* P9：每步前 load（回放重启场景留位；当前不主动续跑） */
        await this.persistLoad(sagaId)
        await step.run(ctx)
        executedSteps.push(step.name)
        /* P9：每步成功后 save（stepIdx + 最新 context 快照） */
        await this.persistSave(sagaId, i + 1, ctx.state as Record<string, unknown>)
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

        /* P9：标记失败 */
        await this.persistMarkFailed(sagaId, message)

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
    /* P9：标记完成 */
    await this.persistMarkCompleted(sagaId)
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

  /* ==========================================================================
   * P9 持久化包装（全部 best-effort，吞异常仅 warn）
   * SagaStateService 缺失（旧测试 / mock）时整体跳过
   * ========================================================================== */

  /**
   * 启动时落 saga_state 记录（status=0）
   */
  private async persistCreate(
    sagaId: string,
    sagaName: string,
    envelope: EventEnvelope,
    state: Record<string, unknown>
  ): Promise<void> {
    if (!this.sagaStateService) return
    try {
      await this.sagaStateService.create({
        sagaId,
        sagaType: sagaName,
        context: {
          source: envelope.source,
          eventName: envelope.eventName,
          envelopeBody: this.safeJson(envelope.body),
          state
        }
      })
    } catch (err) {
      this.logger.warn(
        `[SAGA-STATE] create 失败 saga=${sagaName} id=${sagaId}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 每步前 load（回放占位；当前不主动续跑）
   */
  private async persistLoad(sagaId: string): Promise<void> {
    if (!this.sagaStateService) return
    try {
      await this.sagaStateService.load(sagaId)
    } catch (err) {
      this.logger.warn(
        `[SAGA-STATE] load 失败 id=${sagaId}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 每步后 save 进度
   */
  private async persistSave(
    sagaId: string,
    stepIdx: number,
    state: Record<string, unknown>
  ): Promise<void> {
    if (!this.sagaStateService) return
    try {
      await this.sagaStateService.save(sagaId, { stepIdx, context: { state } })
    } catch (err) {
      this.logger.warn(
        `[SAGA-STATE] save 失败 id=${sagaId} step=${stepIdx}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 标记完成
   */
  private async persistMarkCompleted(sagaId: string): Promise<void> {
    if (!this.sagaStateService) return
    try {
      await this.sagaStateService.markCompleted(sagaId)
    } catch (err) {
      this.logger.warn(
        `[SAGA-STATE] markCompleted 失败 id=${sagaId}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 标记失败
   */
  private async persistMarkFailed(sagaId: string, errorMsg: string): Promise<void> {
    if (!this.sagaStateService) return
    try {
      await this.sagaStateService.markFailed(sagaId, errorMsg)
    } catch (err) {
      this.logger.warn(
        `[SAGA-STATE] markFailed 失败 id=${sagaId}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}
