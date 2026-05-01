/**
 * @file admin-dashboard.service.ts
 * @stage P9 Sprint 4 / W4.C.3
 * @desc 管理后台大盘服务：4 大指标卡 + 7 日趋势
 * @author Sprint4-Agent C
 *
 * 数据源：
 *   - 订单按月分表（order_takeout_YYYYMM / order_errand_YYYYMM；OrderShardingHelper）
 *     聚合订单数 / GMV(SUM(pay_amount)) / 活跃用户：UNION ALL 当月（如跨月 → 取本月 + 上月）
 *   - dispatch_record（全局表）聚合活跃骑手数（30 天 distinct）
 *
 * 注：原任务草案使用 order_main 假设单表；本仓库实际 entity / SQL 都是按月分表，
 *     故走 OrderShardingHelper 拼接物理表名 + UNION ALL；金额用 BigNumber 汇总，
 *     最终 toFixed(2) 字符串返回。
 *
 * 失败兜底：任何 SQL 异常 → 单项指标返回 0 / 空数组，整体接口仍 200，便于前端渲染骨架。
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { DataSource } from 'typeorm'
import { OrderShardingHelper } from '@/modules/order/order-sharding.helper'

/** 4 大指标卡 */
export interface DashboardOverview {
  todayOrderCount: number
  todayGmv: string
  activeUsers: number
  activeRiders: number
  generatedAt: string
}

/** 7 日趋势单点 */
export interface DashboardTrendPoint {
  date: string
  orderCount: number
  gmv: string
}

/** 已支付订单状态阈值（>=20 视为已接单后所有状态，含完成 / 售后） */
const ORDER_PAID_STATUS_MIN = 20

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /* ============================================================================
   * 概览：4 大指标卡
   * ============================================================================ */

  /**
   * 概览数据
   * 返回值：DashboardOverview
   */
  async overview(): Promise<DashboardOverview> {
    const [todayOrderCount, todayGmv, activeUsers, activeRiders] = await Promise.all([
      this.computeTodayOrderCount(),
      this.computeTodayGmv(),
      this.computeActiveUsers(),
      this.computeActiveRiders()
    ])
    return {
      todayOrderCount,
      todayGmv,
      activeUsers,
      activeRiders,
      generatedAt: new Date().toISOString()
    }
  }

  /* ============================================================================
   * 7 日趋势
   * ============================================================================ */

  /**
   * 7 日订单 + GMV 趋势（含今日，按 created_at 日期聚合）
   * 返回值：DashboardTrendPoint[]（升序，缺数据日补 0）
   */
  async trend(): Promise<DashboardTrendPoint[]> {
    const today = new Date()
    const sixDaysAgo = new Date(today)
    sixDaysAgo.setDate(today.getDate() - 6)
    sixDaysAgo.setHours(0, 0, 0, 0)

    const tables = this.unionTables(sixDaysAgo, today)
    if (tables.length === 0) return this.emptyTrend(sixDaysAgo)

    const subqueries = tables
      .map(
        (t) =>
          `SELECT DATE(created_at) AS d, pay_amount
             FROM \`${t}\`
            WHERE created_at >= ? AND is_deleted = 0`
      )
      .join(' UNION ALL ')

    const sql = `SELECT d AS date_str, COUNT(*) AS cnt, COALESCE(SUM(pay_amount), 0) AS gmv
                   FROM (${subqueries}) t
                  GROUP BY d
                  ORDER BY d ASC`
    const params = tables.map(() => sixDaysAgo)

    let rows: Array<{ date_str: string; cnt: string | number; gmv: string | number }> = []
    try {
      rows = await this.dataSource.query<typeof rows>(sql, params)
    } catch (err) {
      this.logger.warn(`trend SQL 失败：${err instanceof Error ? err.message : String(err)}`)
      return this.emptyTrend(sixDaysAgo)
    }

    /* 补齐缺失日期 */
    const indexed = new Map<string, { cnt: number; gmv: string }>()
    for (const r of rows) {
      const key = this.normalizeDateKey(r.date_str)
      indexed.set(key, {
        cnt: Number(r.cnt) || 0,
        gmv: new BigNumber(String(r.gmv ?? '0')).toFixed(2)
      })
    }
    const out: DashboardTrendPoint[] = []
    const cursor = new Date(sixDaysAgo)
    for (let i = 0; i < 7; i++) {
      const key = this.formatDate(cursor)
      const hit = indexed.get(key)
      out.push({ date: key, orderCount: hit?.cnt ?? 0, gmv: hit?.gmv ?? '0.00' })
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }

  /* ============================================================================
   * 单项指标实现
   * ============================================================================ */

  /**
   * 今日订单数（CURDATE 范围内创建，未删除）
   *   - 订单分表：取本月 takeout + errand
   */
  private async computeTodayOrderCount(): Promise<number> {
    const tables = this.todayTables()
    if (tables.length === 0) return 0
    const subqueries = tables
      .map(
        (t) =>
          `SELECT 1 FROM \`${t}\`
            WHERE DATE(created_at) = CURDATE() AND is_deleted = 0`
      )
      .join(' UNION ALL ')
    const sql = `SELECT COUNT(*) AS cnt FROM (${subqueries}) u`
    try {
      const rows = await this.dataSource.query<Array<{ cnt: string | number }>>(sql)
      return rows[0]?.cnt != null ? Number(rows[0].cnt) : 0
    } catch (err) {
      this.logger.warn(
        `computeTodayOrderCount 失败：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
  }

  /**
   * 今日 GMV（status>=20 已支付，BigNumber 累加）
   */
  private async computeTodayGmv(): Promise<string> {
    const tables = this.todayTables()
    if (tables.length === 0) return '0.00'
    const subqueries = tables
      .map(
        (t) =>
          `SELECT pay_amount FROM \`${t}\`
            WHERE DATE(created_at) = CURDATE()
              AND status >= ?
              AND is_deleted = 0`
      )
      .join(' UNION ALL ')
    const sql = `SELECT COALESCE(SUM(pay_amount), 0) AS gmv FROM (${subqueries}) u`
    const params: number[] = tables.map(() => ORDER_PAID_STATUS_MIN)
    try {
      const rows = await this.dataSource.query<Array<{ gmv: string | number }>>(sql, params)
      const raw = rows[0]?.gmv ?? '0'
      return new BigNumber(String(raw)).toFixed(2)
    } catch (err) {
      this.logger.warn(`computeTodayGmv 失败：${err instanceof Error ? err.message : String(err)}`)
      return '0.00'
    }
  }

  /**
   * 活跃用户：近 30 天 distinct user_id
   */
  private async computeActiveUsers(): Promise<number> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const tables = this.unionTables(since, new Date())
    if (tables.length === 0) return 0
    const subqueries = tables
      .map(
        (t) =>
          `SELECT user_id FROM \`${t}\`
            WHERE created_at >= ? AND is_deleted = 0`
      )
      .join(' UNION ALL ')
    const sql = `SELECT COUNT(DISTINCT user_id) AS cnt FROM (${subqueries}) u`
    const params = tables.map(() => since)
    try {
      const rows = await this.dataSource.query<Array<{ cnt: string | number }>>(sql, params)
      return rows[0]?.cnt != null ? Number(rows[0].cnt) : 0
    } catch (err) {
      this.logger.warn(
        `computeActiveUsers 失败：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
  }

  /**
   * 活跃骑手：近 30 天 dispatch_record(accepted_at IS NOT NULL) distinct rider_id
   */
  private async computeActiveRiders(): Promise<number> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    try {
      const rows = await this.dataSource.query<Array<{ cnt: string | number }>>(
        `SELECT COUNT(DISTINCT rider_id) AS cnt
           FROM dispatch_record
          WHERE accepted_at IS NOT NULL
            AND created_at >= ?
            AND is_deleted = 0`,
        [since]
      )
      return rows[0]?.cnt != null ? Number(rows[0].cnt) : 0
    } catch (err) {
      this.logger.warn(
        `computeActiveRiders 失败：${err instanceof Error ? err.message : String(err)}`
      )
      return 0
    }
  }

  /* ============================================================================
   * 内部工具
   * ============================================================================ */

  /**
   * 当日的物理订单表（外卖 + 跑腿）；用 OrderShardingHelper.tableNamesBetween
   */
  private todayTables(): string[] {
    const today = new Date()
    return this.unionTables(today, today)
  }

  /**
   * 区间涉及的物理表（外卖 + 跑腿）
   */
  private unionTables(from: Date, to: Date): string[] {
    const tk = OrderShardingHelper.tableNamesBetween('order_takeout', from, to)
    const er = OrderShardingHelper.tableNamesBetween('order_errand', from, to)
    return [...tk, ...er]
  }

  /**
   * 把 DATE() 返回的字段（可能是 Date / yyyy-mm-dd 字符串）统一成 yyyy-mm-dd
   */
  private normalizeDateKey(raw: string | Date): string {
    if (raw instanceof Date) return this.formatDate(raw)
    if (typeof raw === 'string') {
      /* yyyy-mm-dd or yyyy-mm-dd HH:mm:ss */
      const d = raw.length >= 10 ? raw.slice(0, 10) : raw
      return d
    }
    return String(raw)
  }

  /** yyyy-mm-dd（本地时间） */
  private formatDate(d: Date): string {
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  /** 异常 / 表缺失时返回 7 个零点 */
  private emptyTrend(start: Date): DashboardTrendPoint[] {
    const out: DashboardTrendPoint[] = []
    const cursor = new Date(start)
    for (let i = 0; i < 7; i++) {
      out.push({ date: this.formatDate(cursor), orderCount: 0, gmv: '0.00' })
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }
}
