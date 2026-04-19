/**
 * @file reconciliation.service.ts
 * @stage P4/T4.28（Sprint 4）
 * @desc 渠道对账：mock 模式生成假数据 + 写 reconciliation 表
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 主接口：
 *   - fetchAndCompare(channels, billDate)
 *       1) 对每个 channel 计算平台侧统计：SUM(amount) WHERE pay_method 对应 + DATE(pay_at)=billDate + status=2
 *       2) mock 模式渠道侧 = 平台侧（diff_count=0，状态=1 已对平）
 *       3) UPSERT reconciliation（uk_channel_date 唯一）
 *
 *   - manualRun(channel, billDate, opAdminId) 管理端手动触发，写 OperationLog
 *
 *   - listReconciliations(query) 管理端分页
 *
 * 真实模式（P9 真实接入时）：
 *   - 从微信 /v3/bill/tradebill 下载对账文件 → 解析 CSV
 *   - 与平台数据比对差异行 → diff_count + diff_amount
 *   - status=1 对平 / 2 有差异
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { Between, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, makePageResult, type PageResult } from '@/common'
import { PaymentRecord, Reconciliation } from '@/entities'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { SnowflakeId, generateBizNo } from '@/utils'
import {
  PAYMENT_ADAPTER_REGISTRY,
  type IPaymentAdapter
} from '../adapters/payment-adapter.interface'
import { PayMethod, PayStatus, type PayChannelKey } from '../types/payment.types'

/* ============================================================================
 * 常量
 * ============================================================================ */

/** channel → 对应 PayMethod */
const CHANNEL_TO_PAY_METHOD: Readonly<Record<PayChannelKey, PayMethod>> = {
  wxpay: PayMethod.WX_PAY,
  alipay: PayMethod.ALIPAY
}

/** 对账状态：0 待对 / 1 已对平 / 2 有差异 / 3 处理中 / 4 已处理 */
const RECON_STATUS_BALANCED = 1
const RECON_STATUS_DIFF = 2

/* ============================================================================
 * 入参 / 出参
 * ============================================================================ */

/**
 * 对账明细查询入参
 *
 * 字段：
 *   - channel    可选过滤
 *   - billDate   可选过滤（YYYY-MM-DD）
 *   - status     可选状态过滤
 *   - page / pageSize
 */
export interface ReconQueryInput {
  channel?: PayChannelKey
  billDate?: string
  status?: number
  page?: number
  pageSize?: number
}

/**
 * 对账记录视图
 */
export interface ReconciliationVo {
  id: string
  reconNo: string
  channel: string
  billDate: string
  totalOrders: number
  totalAmount: string
  totalFee: string
  channelOrders: number
  channelAmount: string
  diffCount: number
  diffAmount: string
  status: number
  billFileUrl: string | null
  diffFileUrl: string | null
  finishAt: Date | null
  createdAt: Date
}

/**
 * fetchAndCompare 单 channel 返回
 */
export interface ReconCompareItem {
  channel: PayChannelKey
  billDate: string
  totalOrders: number
  totalAmount: string
  diffCount: number
  status: number
  reconNo: string
  upsert: 'inserted' | 'updated'
}

/* ============================================================================
 * Service
 * ============================================================================ */

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name)

  constructor(
    @InjectRepository(Reconciliation) private readonly reconRepo: Repository<Reconciliation>,
    @InjectRepository(PaymentRecord) private readonly payRepo: Repository<PaymentRecord>,
    @Inject(PAYMENT_ADAPTER_REGISTRY)
    private readonly adapters: Map<PayMethod, IPaymentAdapter>,
    private readonly operationLogService: OperationLogService
  ) {}

  /* ============================================================================
   * 1. 拉取并对账（被 Cron 调用 / 管理端手动触发）
   * ============================================================================ */

  /**
   * 对账主入口
   * 参数：channels 渠道列表；billDate 对账日（默认昨天）
   * 返回值：每渠道一条 ReconCompareItem
   *
   * mock 模式：渠道侧 = 平台侧（已对平）
   * 真实模式：从渠道下载对账文件解析（本期 P9 接入；当前直接走 mock 数据）
   */
  async fetchAndCompare(
    channels: ReadonlyArray<PayChannelKey>,
    billDate: Date
  ): Promise<ReconCompareItem[]> {
    if (channels.length === 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'channels 不能为空')
    }

    const results: ReconCompareItem[] = []
    for (const channel of channels) {
      const item = await this.compareOne(channel, billDate)
      results.push(item)
    }
    return results
  }

  /**
   * 单渠道对账
   * 参数：channel / billDate
   * 返回值：ReconCompareItem
   */
  private async compareOne(channel: PayChannelKey, billDate: Date): Promise<ReconCompareItem> {
    const dayStart = this.startOfDay(billDate)
    const dayEnd = this.endOfDay(billDate)
    const billDateStr = this.toYyyymmdd(billDate)

    /* 1. 平台侧统计：SUM(amount) WHERE pay_method=对应 + status=SUCCESS + pay_at IN [day] */
    const payMethod = CHANNEL_TO_PAY_METHOD[channel]
    const platformRows = await this.payRepo.find({
      where: {
        payMethod,
        status: PayStatus.SUCCESS,
        payAt: Between(dayStart, dayEnd),
        isDeleted: 0
      }
    })
    const totalOrders = platformRows.length
    const totalAmount = platformRows
      .reduce((sum, r) => sum.plus(new BigNumber(r.amount)), new BigNumber(0))
      .toFixed(2)

    /* 2. 渠道侧（mock 模式：等于平台侧；真实模式：从渠道文件解析） */
    const adapter = this.adapters.get(payMethod)
    const isMock = adapter ? adapter.mockMode : true
    let channelOrders = totalOrders
    let channelAmount = totalAmount
    let diffCount = 0
    let diffAmount = '0.00'
    let status = RECON_STATUS_BALANCED
    let billFileUrl: string | null = null

    if (!isMock) {
      /* TODO P9 真实接入：从渠道下载对账文件 → 解析 → 比对差异 */
      this.logger.warn(`[RECON] channel=${channel} 真实对账文件解析未实现（P9 接入），暂用 mock`)
    } else {
      /* mock 模式：渠道侧 = 平台侧 */
      billFileUrl = `mock://recon/${channel}/${billDateStr}.csv`
    }

    if (
      channelOrders !== totalOrders ||
      new BigNumber(channelAmount).comparedTo(totalAmount) !== 0
    ) {
      diffCount = Math.abs(channelOrders - totalOrders)
      diffAmount = new BigNumber(channelAmount).minus(totalAmount).abs().toFixed(2)
      status = RECON_STATUS_DIFF
    }

    /* 3. UPSERT reconciliation (uk_channel_date) */
    const existing = await this.reconRepo.findOne({
      where: { channel, billDate: dayStart, isDeleted: 0 }
    })
    let upsert: 'inserted' | 'updated' = 'inserted'
    let reconNo: string
    if (existing) {
      reconNo = existing.reconNo
      await this.reconRepo.update(
        { id: existing.id },
        {
          totalOrders,
          totalAmount,
          channelOrders,
          channelAmount,
          diffCount,
          diffAmount,
          status,
          billFileUrl
        }
      )
      upsert = 'updated'
    } else {
      reconNo = generateBizNo('B')
      const entity = this.reconRepo.create({
        id: SnowflakeId.next(),
        tenantId: 1,
        reconNo,
        channel,
        billDate: dayStart,
        totalOrders,
        totalAmount,
        totalFee: '0.00',
        channelOrders,
        channelAmount,
        diffCount,
        diffAmount,
        status,
        billFileUrl,
        diffFileUrl: null,
        opAdminId: null,
        finishAt: null
      })
      await this.reconRepo.save(entity)
    }

    this.logger.log(
      `[RECON] ${upsert} channel=${channel} date=${billDateStr} orders=${totalOrders} amount=${totalAmount} diff=${diffCount}`
    )

    return {
      channel,
      billDate: billDateStr,
      totalOrders,
      totalAmount,
      diffCount,
      status,
      reconNo,
      upsert
    }
  }

  /* ============================================================================
   * 2. 管理端手动触发
   * ============================================================================ */

  /**
   * 管理端手动触发对账
   * 参数：channel / billDate / opAdminId
   * 返回值：ReconCompareItem
   * 副作用：写 OperationLog
   */
  async manualRun(
    channel: PayChannelKey,
    billDate: Date,
    opAdminId: string
  ): Promise<ReconCompareItem> {
    const items = await this.fetchAndCompare([channel], billDate)
    const item = items[0]
    try {
      await this.operationLogService.write({
        opAdminId,
        module: 'finance',
        action: 'reconciliation_run',
        resourceType: 'reconciliation',
        resourceId: item.reconNo,
        description: `手动对账 channel=${channel} date=${item.billDate} status=${item.status}`,
        extra: {
          channel,
          billDate: item.billDate,
          totalOrders: item.totalOrders,
          totalAmount: item.totalAmount,
          diffCount: item.diffCount
        }
      })
    } catch (err) {
      this.logger.warn(`[RECON] 写 OperationLog 失败：${(err as Error).message}`)
    }
    return item
  }

  /* ============================================================================
   * 3. 管理端分页
   * ============================================================================ */

  /**
   * 管理端分页查询对账记录
   * 参数：query ReconQueryInput
   * 返回值：PageResult<ReconciliationVo>
   */
  async list(query: ReconQueryInput): Promise<PageResult<ReconciliationVo>> {
    const page = query.page ?? 1
    const pageSize = Math.min(query.pageSize ?? 20, 100)
    const where: Record<string, unknown> = { isDeleted: 0 }
    if (query.channel) where.channel = query.channel
    if (query.billDate) where.billDate = new Date(`${query.billDate}T00:00:00Z`)
    if (query.status !== undefined) where.status = query.status

    const [rows, total] = await this.reconRepo.findAndCount({
      where,
      order: { billDate: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })

    const list: ReconciliationVo[] = rows.map((r) => ({
      id: r.id,
      reconNo: r.reconNo,
      channel: r.channel,
      billDate: this.toYyyymmdd(r.billDate),
      totalOrders: r.totalOrders,
      totalAmount: r.totalAmount,
      totalFee: r.totalFee,
      channelOrders: r.channelOrders,
      channelAmount: r.channelAmount,
      diffCount: r.diffCount,
      diffAmount: r.diffAmount,
      status: r.status,
      billFileUrl: r.billFileUrl,
      diffFileUrl: r.diffFileUrl,
      finishAt: r.finishAt,
      createdAt: r.createdAt
    }))

    return makePageResult(list, total, page, pageSize)
  }

  /* ============================================================================
   * 4. 内部工具
   * ============================================================================ */

  /** 北京时区当日 00:00:00 */
  private startOfDay(d: Date): Date {
    const beijing = new Date(d.getTime() + 8 * 3600 * 1000)
    beijing.setUTCHours(0, 0, 0, 0)
    return new Date(beijing.getTime() - 8 * 3600 * 1000)
  }

  /** 北京时区当日 23:59:59.999 */
  private endOfDay(d: Date): Date {
    const beijing = new Date(d.getTime() + 8 * 3600 * 1000)
    beijing.setUTCHours(23, 59, 59, 999)
    return new Date(beijing.getTime() - 8 * 3600 * 1000)
  }

  /** Date → YYYY-MM-DD（北京时区） */
  private toYyyymmdd(d: Date): string {
    const beijing = new Date(d.getTime() + 8 * 3600 * 1000)
    const y = beijing.getUTCFullYear()
    const m = (beijing.getUTCMonth() + 1).toString().padStart(2, '0')
    const day = beijing.getUTCDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  }
}
