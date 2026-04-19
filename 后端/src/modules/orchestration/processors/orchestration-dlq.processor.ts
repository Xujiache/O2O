/**
 * @file orchestration-dlq.processor.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc BullMQ orchestration-dlq 死信队列消费者：把失败 saga 落 operation_log + 报警
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 行为：
 *   1. SagaRunner 失败时投递 OrchestrationDlqJob 到 orchestration-dlq
 *   2. 本 processor 消费：
 *      - 写 operation_log（resourceType='orchestration_dlq'，便于运营在管理后台查看）
 *      - logger.error 详细堆栈
 *      - 不再向上抛错（jobs 直接成功完成；保留 7 天清理）
 *
 * 设计取舍：
 *   - 不做"自动重试"：Saga 失败大多是数据一致性问题，盲目重试可能放大副作用
 *   - 由运营人员或后续手工补偿任务通过 admin 接口手动复查 / 重投
 *
 * 不实现：
 *   - 报警通道（钉钉 / 飞书 webhook）→ 由 P9 运维监控集成
 *   - 自动重投 admin API → 标 TODO P9
 */

import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger, Optional } from '@nestjs/common'
import type { Job } from 'bullmq'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import {
  ORCHESTRATION_DLQ_JOB_NAME,
  ORCHESTRATION_DLQ_QUEUE,
  type OrchestrationDlqJob
} from '../types/orchestration.types'

@Processor(ORCHESTRATION_DLQ_QUEUE)
export class OrchestrationDlqProcessor extends WorkerHost {
  private readonly logger = new Logger(OrchestrationDlqProcessor.name)

  constructor(@Optional() private readonly operationLogService?: OperationLogService) {
    super()
  }

  /**
   * 消费 orchestration-dlq job
   *
   * 参数：job BullMQ Job<OrchestrationDlqJob>
   * 返回值：{ logged: boolean }（用于 BullMQ 日志展示）
   */
  async process(job: Job<OrchestrationDlqJob>): Promise<{ logged: boolean }> {
    if (job.name !== ORCHESTRATION_DLQ_JOB_NAME) {
      this.logger.warn(`[DLQ] 未知 jobName=${job.name}，跳过`)
      return { logged: false }
    }
    const data = job.data
    const summary = `[ORCHESTRATION-DLQ] saga=${data.sagaName} id=${data.sagaId} event=${data.eventName} step=${data.failedStep} error=${data.error}`
    this.logger.error(summary)
    this.logger.error(
      `[DLQ-DETAIL] executedSteps=${JSON.stringify(data.executedSteps)} body=${JSON.stringify(data.body)}`
    )

    /* 写 operation_log（best-effort：缺失 service 不阻断；opAdminId 用 'system' 占位） */
    if (this.operationLogService) {
      try {
        await this.operationLogService.write({
          opAdminId: 'system',
          module: 'orchestration',
          action: 'saga_failed',
          resourceType: 'saga',
          resourceId: data.sagaId,
          description: summary,
          extra: {
            source: data.source,
            eventName: data.eventName,
            sagaName: data.sagaName,
            failedStep: data.failedStep,
            executedSteps: data.executedSteps,
            error: data.error,
            failedAt: data.failedAt,
            retryCount: job.attemptsMade,
            body: data.body
          }
        })
      } catch (err) {
        this.logger.warn(
          `[DLQ] operation_log 写入失败 saga=${data.sagaId}：${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    return { logged: true }
  }
}
