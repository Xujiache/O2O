/**
 * @file dispatch-retry.processor.ts
 * @stage P4/T4.39（Sprint 6）
 * @desc BullMQ 消费者：dispatch-retry queue 上的 check-timeout 任务到点 → 调 dispatch.handleTimeout
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 设计：
 *   - DispatchService.scheduleTimeoutJob 在派单后 add('check-timeout', delay=15s)
 *   - jobId='dr-{dispatchRecordId}'：保证幂等（同 dispatchRecord 重复添加被 BullMQ 自动覆盖）
 *   - 任务到期由 BullMQ 触发本 processor → 调 dispatch.handleTimeout
 *   - handleTimeout 内部检查 dispatch_record.status：
 *       PENDING(0) → 置 TIMEOUT(3) → 递归 dispatchOrder（attempt+1，超过 3 次进抢单池）
 *       其余 → 已应答，跳过
 *
 * 与 DispatchService 的循环依赖：
 *   - processor 注入 dispatchService（dispatchService → retryQueue → processor）
 *   - 用 forwardRef 解耦
 */

import { Processor, WorkerHost } from '@nestjs/bullmq'
import { forwardRef, Inject, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import {
  CHECK_TIMEOUT_JOB,
  DISPATCH_RETRY_QUEUE,
  DispatchService,
  type DispatchRetryJob
} from '../services/dispatch.service'

@Processor(DISPATCH_RETRY_QUEUE)
export class DispatchRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchRetryProcessor.name)

  constructor(
    @Inject(forwardRef(() => DispatchService))
    private readonly dispatchService: DispatchService
  ) {
    super()
  }

  /**
   * 消费 dispatch-retry job
   * 参数：job
   * 返回值：{ done: true } 用于 BullMQ 日志
   */
  async process(job: Job<DispatchRetryJob>): Promise<{ done: boolean }> {
    if (job.name !== CHECK_TIMEOUT_JOB) {
      this.logger.warn(`[DISPATCH-RETRY] 未知 jobName=${job.name}，跳过`)
      return { done: false }
    }
    const { dispatchRecordId, orderNo, orderType, attempt } = job.data
    if (!dispatchRecordId || !orderNo) {
      this.logger.warn(`[DISPATCH-RETRY] job=${job.id} 数据缺失，跳过`)
      return { done: false }
    }
    try {
      await this.dispatchService.handleTimeout(dispatchRecordId, orderNo, orderType, attempt)
      this.logger.log(
        `[DISPATCH-RETRY] handle ok dr=${dispatchRecordId} order=${orderNo} attempt=${attempt}`
      )
      return { done: true }
    } catch (err) {
      this.logger.error(
        `[DISPATCH-RETRY] handle 失败 dr=${dispatchRecordId} order=${orderNo}：` +
          (err instanceof Error ? err.message : String(err))
      )
      throw err
    }
  }
}
