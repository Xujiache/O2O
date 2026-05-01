/**
 * @file admin-finance-ext.service.ts
 * @stage P9 Sprint 4 / W4.B.2
 * @desc 管理后台财务扩展真聚合：overview / billList / settlementRecordRetry
 * @author 单 Agent V2.0（Sprint 4 Agent B）
 *
 * 职责：
 *   - getOverview：用 raw query 聚合 income / commission / refund / balance + 7 日趋势
 *   - getBillList：account_flow JOIN account 分页查询（按 ownerType 反查 ownerId 关联主体）
 *   - retrySettlement：用 settlement_record.id 反查 record，调 SettlementService.execute 重跑单条
 *
 * 金额：全程 BigNumber + .toFixed(2)；禁用 number.parseFloat
 *
 * 表结构对齐：
 *   - account            余额：SUM(balance) WHERE is_deleted=0
 *   - account_flow       收入：direction=1 AND biz_type IN (ORDER_INCOME, ORDER_REFUND)
 *                        实际"income"按 direction=1 + biz_type IN (1,5,6) 累加更精确（订单收入/充值/奖励）
 *                        本期保守按任务描述走 biz_type IN (1, 2)
 *   - settlement_record  佣金：SUM(settle_amount) WHERE target_type=PLATFORM AND status=EXECUTED
 *                        （settlement_record 无 platform_amount 列；按 target_type=3 即平台分账落 settle_amount 聚合）
 *   - refund_record      退款：SUM(amount) WHERE status=2(成功)
 *
 * 注：本 service 假定 admin 域已 import FinanceModule（A 收尾合并），SettlementService 可注入
 */

import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { DataSource, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { SettlementRecord } from '@/entities'
import { SettlementService } from '@/modules/finance/services/settlement.service'

/** 7 日趋势聚合默认窗口（含今天） */
const TREND_WINDOW_DAYS = 7

/** 账单分页最大每页 */
const MAX_PAGE_SIZE = 100

/** 财务概览查询入参 */
export interface OverviewQuery {
  startDate?: string
  endDate?: string
}

/** 财务概览返回 VO */
export interface FinanceOverviewVo {
  income: string
  commission: string
  refund: string
  balance: string
  trend: Array<{ date: string; income: string; commission: string; refund: string }>
}

/** 账单分页查询入参 */
export interface BillListQuery {
  page?: number
  pageSize?: number
  ownerType?: number
  bizType?: number
  direction?: number
  startDate?: string
  endDate?: string
}

/** 账单单行 VO */
export interface BillItemVo {
  id: string
  flowNo: string
  accountId: string
  ownerType: number
  ownerId: string
  direction: number
  bizType: number
  amount: string
  balanceAfter: string
  relatedNo: string | null
  remark: string | null
  createdAt: Date
}

/** 账单列表分页 VO */
export interface BillListVo {
  list: BillItemVo[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

/** 重试结果 VO */
export interface SettlementRetryVo {
  retried: boolean
  recordId: string
  orderNo: string
  status: number
  errorMsg?: string | null
}

@Injectable()
export class AdminFinanceExtService {
  private readonly logger = new Logger(AdminFinanceExtService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SettlementRecord)
    private readonly recordRepo: Repository<SettlementRecord>,
    @Optional() private readonly settlementService?: SettlementService
  ) {}

  /* ==========================================================================
   * 一、财务概览
   * ========================================================================== */

  /**
   * 财务概览（收入 / 佣金 / 退款 / 余额 + 7 日趋势）
   *
   * 入参：query 起止时间（ISO yyyy-MM-dd 或 yyyy-MM-ddTHH:mm:ss）
   *      默认范围：[今天-30天 00:00, 今天 23:59:59]
   *
   * 行为：raw query 4 段聚合 + 1 段日维度 trend
   *
   * 返回：FinanceOverviewVo（金额 string + .toFixed(2)）
   */
  async getOverview(query: OverviewQuery): Promise<FinanceOverviewVo> {
    const { startAt, endAt } = this.resolveRange(query)

    /* income：account_flow 收入（direction=1 AND biz_type IN (1,2)）
       说明：biz_type 1=订单收入 / 2=订单退款（出账方向时）
       任务描述要求 IN (1, 2) 与 direction=1，可能重叠语义有限；保留此口径以便后续口径调整 */
    const incomeRow = await this.dataSource.query<Array<{ s: string | null }>>(
      `SELECT COALESCE(SUM(amount), 0) AS s
       FROM account_flow
       WHERE is_deleted = 0
         AND direction = 1
         AND biz_type IN (1, 2)
         AND created_at BETWEEN ? AND ?`,
      [startAt, endAt]
    )
    const income = this.toMoney(incomeRow[0]?.s)

    /* commission：平台分账成功金额 SUM(settle_amount) target_type=3 status=1（EXECUTED） */
    const commissionRow = await this.dataSource.query<Array<{ s: string | null }>>(
      `SELECT COALESCE(SUM(settle_amount), 0) AS s
       FROM settlement_record
       WHERE is_deleted = 0
         AND target_type = 3
         AND status = 1
         AND created_at BETWEEN ? AND ?`,
      [startAt, endAt]
    )
    const commission = this.toMoney(commissionRow[0]?.s)

    /* refund：退款成功 SUM(amount) status=2 */
    const refundRow = await this.dataSource.query<Array<{ s: string | null }>>(
      `SELECT COALESCE(SUM(amount), 0) AS s
       FROM refund_record
       WHERE is_deleted = 0
         AND status = 2
         AND created_at BETWEEN ? AND ?`,
      [startAt, endAt]
    )
    const refund = this.toMoney(refundRow[0]?.s)

    /* balance：账户余额合计 SUM(balance) WHERE is_deleted=0 （全平台余额快照，不受时间范围影响） */
    const balanceRow = await this.dataSource.query<Array<{ s: string | null }>>(
      `SELECT COALESCE(SUM(balance), 0) AS s FROM account WHERE is_deleted = 0`
    )
    const balance = this.toMoney(balanceRow[0]?.s)

    /* 7 日趋势（按日聚合 income / commission / refund） */
    const trend = await this.getTrend()

    return { income, commission, refund, balance, trend }
  }

  /**
   * 7 日趋势聚合（最近 TREND_WINDOW_DAYS 日，含今天）
   *
   * 实现：单 SQL 按 DATE(created_at) GROUP BY，从 account_flow / settlement_record /
   *      refund_record 三个表各拉一份，再以日期为 key 合并；缺失日补零
   */
  private async getTrend(): Promise<FinanceOverviewVo['trend']> {
    const days = this.lastDays(TREND_WINDOW_DAYS)
    const begin = new Date(days[0] + 'T00:00:00')
    const end = new Date(days[days.length - 1] + 'T23:59:59')

    const incomeRows = await this.dataSource.query<Array<{ d: string; s: string }>>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COALESCE(SUM(amount), 0) AS s
       FROM account_flow
       WHERE is_deleted = 0 AND direction = 1 AND biz_type IN (1, 2)
         AND created_at BETWEEN ? AND ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')`,
      [begin, end]
    )
    const commissionRows = await this.dataSource.query<Array<{ d: string; s: string }>>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COALESCE(SUM(settle_amount), 0) AS s
       FROM settlement_record
       WHERE is_deleted = 0 AND target_type = 3 AND status = 1
         AND created_at BETWEEN ? AND ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')`,
      [begin, end]
    )
    const refundRows = await this.dataSource.query<Array<{ d: string; s: string }>>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COALESCE(SUM(amount), 0) AS s
       FROM refund_record
       WHERE is_deleted = 0 AND status = 2
         AND created_at BETWEEN ? AND ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')`,
      [begin, end]
    )

    const incomeMap = this.rowsToMap(incomeRows)
    const commMap = this.rowsToMap(commissionRows)
    const refundMap = this.rowsToMap(refundRows)

    return days.map((d) => ({
      date: d,
      income: this.toMoney(incomeMap.get(d) ?? '0'),
      commission: this.toMoney(commMap.get(d) ?? '0'),
      refund: this.toMoney(refundMap.get(d) ?? '0')
    }))
  }

  /* ==========================================================================
   * 二、账单分页
   * ========================================================================== */

  /**
   * 账单列表（account_flow 分页 + 可选过滤）
   *
   * 入参：BillListQuery
   * 返回：BillListVo
   */
  async getBillList(query: BillListQuery): Promise<BillListVo> {
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20))

    const where: string[] = ['f.is_deleted = 0']
    const params: unknown[] = []

    if (query.ownerType !== undefined) {
      where.push('f.owner_type = ?')
      params.push(Number(query.ownerType))
    }
    if (query.bizType !== undefined) {
      where.push('f.biz_type = ?')
      params.push(Number(query.bizType))
    }
    if (query.direction !== undefined) {
      where.push('f.direction = ?')
      params.push(Number(query.direction))
    }
    if (query.startDate) {
      where.push('f.created_at >= ?')
      params.push(new Date(query.startDate))
    }
    if (query.endDate) {
      where.push('f.created_at <= ?')
      params.push(new Date(query.endDate))
    }

    const whereSql = where.join(' AND ')

    const totalRow = await this.dataSource.query<Array<{ c: number }>>(
      `SELECT COUNT(*) AS c FROM account_flow f WHERE ${whereSql}`,
      params
    )
    const total = Number(totalRow[0]?.c ?? 0)

    const rows = await this.dataSource.query<
      Array<{
        id: string
        flow_no: string
        account_id: string
        owner_type: number
        owner_id: string
        direction: number
        biz_type: number
        amount: string
        balance_after: string
        related_no: string | null
        remark: string | null
        created_at: Date
      }>
    >(
      `SELECT f.id, f.flow_no, f.account_id, f.owner_type, f.owner_id, f.direction,
              f.biz_type, f.amount, f.balance_after, f.related_no, f.remark, f.created_at
       FROM account_flow f
       INNER JOIN account a ON a.id = f.account_id AND a.is_deleted = 0
       WHERE ${whereSql}
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    )

    const list: BillItemVo[] = rows.map((r) => ({
      id: r.id,
      flowNo: r.flow_no,
      accountId: r.account_id,
      ownerType: r.owner_type,
      ownerId: r.owner_id,
      direction: r.direction,
      bizType: r.biz_type,
      amount: this.toMoney(r.amount),
      balanceAfter: this.toMoney(r.balance_after),
      relatedNo: r.related_no,
      remark: r.remark,
      createdAt: r.created_at
    }))

    return {
      list,
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
      }
    }
  }

  /* ==========================================================================
   * 三、分账记录重试
   * ========================================================================== */

  /**
   * 重试单条 settlement_record（仅允许 status=2 失败 / status=0 待执行）
   *
   * 入参：id settlement_record.id
   * 行为：
   *   1) 反查 record（is_deleted=0）；不存在 → BIZ_RESOURCE_NOT_FOUND
   *   2) status=1 已执行 → 返回 retried=false（无需重试）
   *   3) status=3 已撤销 → 返回 retried=false
   *   4) status=2 失败 / 0 待执行：先 reset status=0 + errorMsg=null，调
   *      SettlementService.execute(record) 重跑（内部走 AccountService.earn CAS）
   *
   * 返回：SettlementRetryVo
   *
   * 注：任务描述提到"调 SettlementService.runForOrder"；本实现选择 execute 单条，
   *     因为 runForOrder 需完整 SettlementInput（订单原始字段），而单条记录重试
   *     语义更精确；orderNo / amount / target 等关键字段已在 record 内
   */
  async retrySettlement(id: string): Promise<SettlementRetryVo> {
    const record = await this.recordRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!record) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '分账记录不存在')
    }

    /* 1 EXECUTED：无需重试 */
    if (record.status === 1) {
      return {
        retried: false,
        recordId: id,
        orderNo: record.orderNo,
        status: 1,
        errorMsg: '已执行，无需重试'
      }
    }
    /* 3 REVERSED / CANCELED：拒绝 */
    if (record.status === 3) {
      return {
        retried: false,
        recordId: id,
        orderNo: record.orderNo,
        status: 3,
        errorMsg: '已撤销，无法重试'
      }
    }

    if (!this.settlementService) {
      throw new BusinessException(
        BizErrorCode.SYSTEM_DB_ERROR,
        'SettlementService 未注入，重试不可用'
      )
    }

    /* 重置 status=0 + errorMsg=null（execute 内部要求 PENDING） */
    record.status = 0
    record.errorMsg = null
    record.updatedAt = new Date()
    await this.recordRepo.save(record)

    const after = await this.settlementService.execute(record)
    return {
      retried: true,
      recordId: id,
      orderNo: after.orderNo,
      status: after.status,
      errorMsg: after.errorMsg ?? null
    }
  }

  /* ==========================================================================
   * 内部工具
   * ========================================================================== */

  /**
   * 把 raw 数字 / 字符串归一为 BigNumber.toFixed(2)
   * 入参：v 任意可被 BigNumber 接受的输入；null/undefined → '0.00'
   */
  private toMoney(v: string | number | null | undefined): string {
    if (v === null || v === undefined) return '0.00'
    const bn = new BigNumber(v as BigNumber.Value)
    if (bn.isNaN() || !bn.isFinite()) return '0.00'
    return bn.toFixed(2)
  }

  /**
   * 解析 startDate / endDate；缺省 = 最近 30 天
   * 返回 [startAt, endAt] Date 对象
   */
  private resolveRange(query: OverviewQuery): { startAt: Date; endAt: Date } {
    const endAt = query.endDate ? new Date(query.endDate) : this.endOfToday()
    const startAt = query.startDate
      ? new Date(query.startDate)
      : new Date(endAt.getTime() - 30 * 24 * 3600 * 1000)
    return { startAt, endAt }
  }

  /**
   * 今天 23:59:59.999
   */
  private endOfToday(): Date {
    const d = new Date()
    d.setHours(23, 59, 59, 999)
    return d
  }

  /**
   * 最近 N 天日期数组（yyyy-MM-dd），含今天
   */
  private lastDays(n: number): string[] {
    const arr: string[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 3600 * 1000)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      arr.push(`${yyyy}-${mm}-${dd}`)
    }
    return arr
  }

  /**
   * 把 [{ d, s }] 行集转 Map<date, sum>
   */
  private rowsToMap(rows: Array<{ d: string; s: string }>): Map<string, string> {
    const m = new Map<string, string>()
    for (const r of rows) {
      m.set(r.d, r.s)
    }
    return m
  }
}
