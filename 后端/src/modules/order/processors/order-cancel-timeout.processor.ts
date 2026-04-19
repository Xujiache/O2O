/**
 * @file order-cancel-timeout.processor.ts
 * @stage P4/T4.20（Sprint 3）
 * @desc BullMQ 消费者：到时调 OrderTakeoutService.cancelByTimeout
 * @author 单 Agent V2.0
 *
 * 设计：
 *   - @Processor('order-cancel-timeout')：消费 takeout.service.create 时 add 的延迟 job
 *   - jobId='pay-timeout:{orderNo}'：保证幂等（同 orderNo 多次添加会被覆盖）
 *   - 任务到期由 BullMQ 触发本 processor，调 cancelByTimeout(orderNo)
 *   - cancelByTimeout 内部：若订单 status != 0（已支付 / 已取消），直接返回 false
 *   - 失败：BullMQ 默认 attempts=3 + 指数退避（QueuesModule.defaultJobOptions）
 *
 * 与 OrderTimeoutScannerService 的关系：
 *   - 两者各跑一份，互为兜底；cancelByTimeout 幂等
 *   - 进程崩溃 / Redis 重启场景由 BullMQ 持久化保障；ZSet 只是辅助加速
 */

import { Processor, WorkerHost } from '@nestjs/bullmq'
import { forwardRef, Inject, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { ORDER_CANCEL_TIMEOUT_QUEUE, OrderTakeoutService } from '../services/order-takeout.service'

/** Job payload */
export interface OrderCancelTimeoutJob {
  orderNo: string
  reason: 'PayTimeout'
}

/**
 * BullMQ 处理器：order-cancel-timeout
 *
 * 注：
 *   - 队列在用户后续整合的 order.module 内通过
 *     `BullModule.registerQueue({ name: ORDER_CANCEL_TIMEOUT_QUEUE })` 注册
 *   - takeout.service @InjectQueue(ORDER_CANCEL_TIMEOUT_QUEUE) 添加 job
 *   - 本 processor 实例由 NestJS 自动 bootstrap 调用 process()
 */
@Processor(ORDER_CANCEL_TIMEOUT_QUEUE)
export class OrderCancelTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderCancelTimeoutProcessor.name)

  constructor(
    @Inject(forwardRef(() => OrderTakeoutService))
    private readonly takeoutService: OrderTakeoutService
  ) {
    super()
  }

  /**
   * 消费 job：调 cancelByTimeout
   * 参数：job BullMQ Job
   * 返回值：{ canceled: boolean }（供 BullMQ 日志展示）
   */
  async process(job: Job<OrderCancelTimeoutJob>): Promise<{ canceled: boolean }> {
    const { orderNo, reason } = job.data
    if (!orderNo) {
      this.logger.warn(`[PROC] job ${job.id} 缺少 orderNo，跳过`)
      return { canceled: false }
    }
    if (reason !== 'PayTimeout') {
      this.logger.debug(`[PROC] job ${job.id} reason=${reason}，跳过`)
      return { canceled: false }
    }
    try {
      const canceled = await this.takeoutService.cancelByTimeout(orderNo)
      this.logger.log(`[PROC] orderNo=${orderNo} canceled=${canceled}`)
      return { canceled }
    } catch (err) {
      this.logger.error(
        `[PROC] 取消订单 ${orderNo} 失败（job=${job.id}）：${(err as Error).message}`
      )
      throw err /* 让 BullMQ 触发重试 */
    }
  }
}
