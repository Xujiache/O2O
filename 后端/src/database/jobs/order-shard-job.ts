/**
 * @file order-shard-job.ts
 * @stage P2/T2.16 占位
 * @desc 月分表自动维护 Job 占位
 * @todo P3 完整实现（接入分布式锁 + Sentry 告警 + 钉钉通知 + 失败重试）
 * @design 详见 ./monthly-table-job.md
 * @author 员工 A 修复轮次 R1（P2-REVIEW-01）
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import type { DataSource } from 'typeorm'

/**
 * OrderShardJob —— 订单按月分表自动预创建调度任务（P2 占位）
 * 功能：每月 1 日 02:00 调用 sp_create_order_monthly_tables 存储过程，
 *       为下个月预生成 4 张订单分表（外卖主表/外卖明细/跑腿主表/状态日志）
 * 参数：无（cron 触发；手动重跑入口为 createForMonth(yyyymm)）
 * 返回值：Promise<void>
 * 用途：避免月初下单写入到尚未存在的物理表导致 1146 Table doesn't exist
 * 备注：本类 P2 阶段不注册到任何 Module；P3 实现完整后由 ScheduleModule 接管
 */
@Injectable()
export class OrderShardJob {
  private readonly logger = new Logger(OrderShardJob.name)

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource
  ) {}

  /**
   * Cron 触发入口
   * 功能：每月 1 日 02:00（Asia/Shanghai）自动创建下月订单分表
   * 参数：无
   * 返回值：Promise<void>
   * 用途：被 NestJS @nestjs/schedule 调度器自动触发
   */
  @Cron('0 0 2 1 * *', {
    name: 'order-shard-job',
    timeZone: 'Asia/Shanghai'
  })
  async handleMonthly(): Promise<void> {
    // TODO[P3]: 接入分布式锁 lock:job:monthly-table:{yyyymm} + Sentry 上报 + 钉钉告警

    // 计算下月 yyyymm，不依赖第三方日期库
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextYyyymm = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}`

    await this.createForMonth(nextYyyymm)
  }

  /**
   * 手动/Cron 共用执行入口
   * 功能：调用 MySQL 存储过程 sp_create_order_monthly_tables(yyyymm)
   *       幂等创建该月 4 张订单分表
   * 参数：yyyymm —— 6 位年月字符串（例 '202608'）
   * 返回值：Promise<void>
   * 用途：cron 自动触发 + 管理后台「手动补建」按钮共用
   */
  async createForMonth(yyyymm: string): Promise<void> {
    // TODO[P3]: 接入分布式锁 lock:job:monthly-table:{yyyymm} + Sentry 上报 + 钉钉告警

    this.logger.log(`Creating monthly tables for ${yyyymm}`)
    try {
      await this.ds.query('CALL sp_create_order_monthly_tables(?)', [yyyymm])
      this.logger.log(`OK: monthly tables for ${yyyymm}`)
    } catch (err) {
      this.logger.error(`FAILED: monthly tables for ${yyyymm}`, err as Error)
      throw err
    }
  }
}
