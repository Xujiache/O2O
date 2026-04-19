/**
 * @file reconciliation-cron.processor.ts
 * @stage P4/T4.28（Sprint 4）
 * @desc 每日 02:00 触发对账（@nestjs/schedule Cron）
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 任务约定（任务 §6.5）：
 *   @Cron('0 0 2 * * *') 每天 02:00（北京时间）
 *   触发：reconciliationService.fetchAndCompare(['wxpay','alipay'], yesterday)
 *
 * 不使用 BullMQ Cron（任务约束：BullMQ Cron 由 Sprint 5 注入）
 *
 * 注意：
 *   - cron 表达式 '0 0 2 * * *' 是 6 字段格式（s m h d M w）
 *   - timeZone 'Asia/Shanghai' 保证按北京时间触发
 *   - 失败 best-effort，仅 logger.error，不抛出（避免 Nest 进程退出）
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { ReconciliationService } from '../services/reconciliation.service'
import type { PayChannelKey } from '../types/payment.types'

/* ============================================================================
 * Cron processor
 * ============================================================================ */

/** 对账任务覆盖渠道集合 */
const RECON_CHANNELS: ReadonlyArray<PayChannelKey> = ['wxpay', 'alipay']

@Injectable()
export class ReconciliationCronProcessor {
  private readonly logger = new Logger(ReconciliationCronProcessor.name)

  constructor(private readonly reconciliationService: ReconciliationService) {}

  /**
   * 每日 02:00 触发对账
   * 表达式：0 0 2 * * *（秒 分 时 日 月 周）
   * 时区：Asia/Shanghai
   *
   * 也可使用 @nestjs/schedule 自带常量（CronExpression.EVERY_DAY_AT_2AM 等价表达式）
   */
  @Cron('0 0 2 * * *', { name: 'payment-reconciliation-daily', timeZone: 'Asia/Shanghai' })
  async runDaily(): Promise<void> {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
    this.logger.log(
      `[CRON] 启动每日对账 channels=[${RECON_CHANNELS.join(',')}] date=${this.fmt(yesterday)}`
    )
    try {
      const items = await this.reconciliationService.fetchAndCompare(RECON_CHANNELS, yesterday)
      for (const item of items) {
        this.logger.log(
          `[CRON] 完成 channel=${item.channel} date=${item.billDate} orders=${item.totalOrders} amount=${item.totalAmount} diff=${item.diffCount} status=${item.status} (${item.upsert})`
        )
      }
    } catch (err) {
      this.logger.error(`[CRON] 每日对账失败：${(err as Error).message}`)
    }
  }

  /**
   * @nestjs/schedule 内置常量引用（避免编译期未使用警告）
   * 仅作为参考；当前任务使用自定义表达式以保持北京时区。
   */
  static cronExpression(): string {
    return CronExpression.EVERY_DAY_AT_2AM
  }

  /** Date → YYYY-MM-DD（北京时区） */
  private fmt(d: Date): string {
    const beijing = new Date(d.getTime() + 8 * 3600 * 1000)
    const y = beijing.getUTCFullYear()
    const m = (beijing.getUTCMonth() + 1).toString().padStart(2, '0')
    const day = beijing.getUTCDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  }
}
