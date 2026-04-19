/**
 * @file settlement-cron.service.ts
 * @stage P4/T4.32（Sprint 5）
 * @desc 分账定时任务：每日 02:00 (Asia/Shanghai) 扫描昨日 finished 订单 → 分账
 * @author 单 Agent V2.0
 *
 * 触发条件（V4.31 验收）：
 *   - cron `0 0 2 * * *` Asia/Shanghai
 *   - 扫描昨天 0:00 ~ 今天 0:00 之间 finished_at + status=55 已完成的订单
 *   - 对每笔订单调 SettlementService.runForOrder（compute → execute）
 *
 * 分批：单次拉取 500 条，循环到耗尽
 *
 * 失败处理：
 *   - 单订单失败被 SettlementService.execute 内部捕获并标记 status=2 失败
 *   - cron 整体失败仅打 error log；下次 cron 自动重试（幂等：同订单 active 记录会跳过）
 *
 * 手工补跑：管理端 POST /admin/settlement/run-once { date: 'yyyyMMdd' }
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { type RunOnceResultVo } from '../dto/settlement.dto'
import { type SettlementInput, SettlementService } from './settlement.service'

/** 单批扫描页大小（与 SettlementService.ORDER_SCAN_PAGE_SIZE 对齐） */
const PAGE_SIZE = 500
/** 防御性最大循环次数：避免极端场景下死循环 */
const MAX_BATCH_LOOPS = 200

@Injectable()
export class SettlementCronService {
  private readonly logger = new Logger(SettlementCronService.name)

  constructor(private readonly settlementService: SettlementService) {}

  /**
   * Cron 入口：每日 02:00 触发昨日订单分账
   *
   * cron 表达式：second minute hour day month weekday
   *   `0 0 2 * * *` = 每天 02:00:00
   *
   * 时区显式指定 Asia/Shanghai：避免容器 TZ 漂移导致跨日错位
   */
  @Cron('0 0 2 * * *', {
    name: 'finance-settlement-daily',
    timeZone: 'Asia/Shanghai'
  })
  async runDailySettlement(): Promise<void> {
    const yesterday = this.computeYesterday()
    this.logger.log(`[settlement-cron] 触发：执行 ${this.formatDate(yesterday)} 的分账`)
    try {
      const summary = await this.runForDate(yesterday)
      this.logger.log(
        `[settlement-cron] 完成 date=${summary.date} scanned=${summary.scannedOrders} ` +
          `created=${summary.createdRecords} executed=${summary.executedRecords} ` +
          `failed=${summary.failedRecords} skipped=${summary.skippedRecords}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[settlement-cron] 执行失败：${msg}`)
    }
  }

  /**
   * 手工/补跑入口（管理端 POST /admin/settlement/run-once 调用）
   *
   * 参数：targetDay 业务日（按其 00:00 ~ 次日 00:00 的 finished_at 范围扫描）
   * 返回值：RunOnceResultVo
   */
  async runForDate(targetDay: Date): Promise<RunOnceResultVo> {
    let totalScanned = 0
    let totalCreated = 0
    let totalExecuted = 0
    let totalFailed = 0
    let totalSkipped = 0
    let offset = 0

    for (let loop = 0; loop < MAX_BATCH_LOOPS; loop++) {
      const inputs = await this.settlementService.listFinishedOrdersOf(targetDay, offset)
      if (inputs.length === 0) break

      totalScanned += inputs.length
      for (const inp of inputs) {
        const r = await this.runOneSafely(inp)
        totalCreated += r.created
        totalExecuted += r.executed
        totalFailed += r.failed
        totalSkipped += r.skipped
      }

      if (inputs.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    return {
      date: this.formatDate(targetDay),
      scannedOrders: totalScanned,
      createdRecords: totalCreated,
      executedRecords: totalExecuted,
      failedRecords: totalFailed,
      skippedRecords: totalSkipped
    }
  }

  /**
   * 单订单执行（防止单订单异常中断整批）
   */
  private async runOneSafely(input: SettlementInput): Promise<{
    created: number
    executed: number
    failed: number
    skipped: number
  }> {
    try {
      return await this.settlementService.runForOrder(input)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[settlement-cron] 单订单 ${input.orderNo} 失败：${msg}`)
      return { created: 0, executed: 0, failed: 0, skipped: 0 }
    }
  }

  /**
   * 计算"昨日"（相对当前 Date.now）
   */
  private computeYesterday(): Date {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return new Date(today.getTime() - 24 * 3600 * 1000)
  }

  /**
   * 格式化为 yyyyMMdd（用于日志 / RunOnceResultVo.date）
   */
  private formatDate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${day}`
  }

  /**
   * yyyyMMdd 字符串 → Date（取该日 00:00:00 本机时区）
   * 用途：admin run-once 入参解析
   */
  parseYyyymmdd(yyyymmdd: string): Date {
    if (!/^\d{8}$/.test(yyyymmdd)) {
      throw new Error('date 必须为 yyyyMMdd 8 位')
    }
    const y = parseInt(yyyymmdd.slice(0, 4), 10)
    const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1
    const d = parseInt(yyyymmdd.slice(6, 8), 10)
    return new Date(y, m, d, 0, 0, 0, 0)
  }
}
