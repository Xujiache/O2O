/**
 * @file reconciliation-report.service.ts
 * @stage P4/T4.35（Sprint 5）
 * @desc 对账差异报表：按 billDate 查 reconciliation 表 → 用 exceljs 生成 Excel buffer
 * @author 单 Agent V2.0
 *
 * 验收 V4.34：生成 + 导出 Excel
 *
 * 流程：
 *   1) 解析 billDate（yyyyMMdd 或 yyyy-MM-dd）→ Date 对象
 *   2) 查 reconciliation WHERE bill_date = ? AND is_deleted = 0
 *   3) 用 exceljs 生成 .xlsx Buffer：
 *      列：渠道 / 账单日 / 平台订单数 / 平台金额 / 渠道手续费 /
 *           渠道订单数 / 渠道金额 / 差异笔数 / 差异金额 / 状态 / 处理人 / 处理时间
 *   4) Controller 用 res.attachment + res.send(buffer) 直出下载（不写 OSS）
 *
 * 简化：本期不写 OSS（FileService 当前 API 仅支持 multer Express.Multer.File 上传，
 *       无 uploadBuffer 接口）。Controller 直接走 HTTP attachment 下载即可。
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import * as ExcelJS from 'exceljs'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { Reconciliation } from '@/entities'
import { type ReportVo } from '../dto/recon-report.dto'
import { type ReconciliationStatus } from '../types/finance.types'

/** 状态码 → 中文描述（Excel 显示用） */
const STATUS_TEXT: Record<ReconciliationStatus, string> = {
  0: '待对',
  1: '已对平',
  2: '有差异',
  3: '处理中',
  4: '已处理'
}

@Injectable()
export class ReconciliationReportService {
  private readonly logger = new Logger(ReconciliationReportService.name)

  constructor(
    @InjectRepository(Reconciliation)
    private readonly reconRepo: Repository<Reconciliation>
  ) {}

  /**
   * 生成对账差异报表（Excel 二进制）
   *
   * 参数：rawBillDate yyyyMMdd 或 yyyy-MM-dd
   * 返回值：ReportVo（buffer + filename + rowCount + billDate）
   * 错误：billDate 格式非法 → PARAM_INVALID
   */
  async generateReport(rawBillDate: string): Promise<ReportVo> {
    const billDate = this.parseBillDate(rawBillDate)
    const billDateStr = this.formatYmd(billDate)

    /* TypeORM 'date' 列 driver 上层是字符串；用原始 query 兼容性更好 */
    const recons = await this.reconRepo
      .createQueryBuilder('r')
      .where('r.bill_date = :bd', { bd: billDateStr })
      .andWhere('r.is_deleted = 0')
      .orderBy('r.channel', 'ASC')
      .getMany()

    const wb = new ExcelJS.Workbook()
    wb.creator = 'O2O Finance'
    wb.created = new Date()
    const ws = wb.addWorksheet(`对账差异_${billDateStr}`, {
      views: [{ state: 'frozen', ySplit: 1 }]
    })
    ws.columns = [
      { header: '渠道', key: 'channel', width: 14 },
      { header: '账单日', key: 'billDate', width: 14 },
      { header: '平台订单数', key: 'totalOrders', width: 14 },
      { header: '平台金额（元）', key: 'totalAmount', width: 18 },
      { header: '渠道手续费（元）', key: 'totalFee', width: 18 },
      { header: '渠道订单数', key: 'channelOrders', width: 14 },
      { header: '渠道金额（元）', key: 'channelAmount', width: 18 },
      { header: '差异笔数', key: 'diffCount', width: 12 },
      { header: '差异金额（元）', key: 'diffAmount', width: 18 },
      { header: '状态', key: 'statusText', width: 10 },
      { header: '处理人 ID', key: 'opAdminId', width: 22 },
      { header: '处理时间', key: 'finishAt', width: 22 }
    ]
    /* 表头加粗 */
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

    for (const r of recons) {
      ws.addRow({
        channel: r.channel,
        billDate: this.formatYmd(r.billDate),
        totalOrders: r.totalOrders,
        totalAmount: r.totalAmount,
        totalFee: r.totalFee,
        channelOrders: r.channelOrders,
        channelAmount: r.channelAmount,
        diffCount: r.diffCount,
        diffAmount: r.diffAmount,
        statusText: STATUS_TEXT[r.status as ReconciliationStatus] ?? `状态${r.status}`,
        opAdminId: r.opAdminId ?? '',
        finishAt: r.finishAt ? r.finishAt.toISOString().replace('T', ' ').slice(0, 19) : ''
      })
    }

    /* 无数据时也输出表头，避免下载空文件 */
    const arrayBuffer = await wb.xlsx.writeBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const filename = `reconciliation_${billDateStr}.xlsx`
    this.logger.log(`[recon-report] 生成 ${filename} 行数=${recons.length} 大小=${buffer.length}B`)
    return {
      buffer,
      filename,
      rowCount: recons.length,
      billDate: billDateStr
    }
  }

  /**
   * 解析 billDate（yyyyMMdd 或 yyyy-MM-dd）→ Date
   */
  private parseBillDate(raw: string): Date {
    if (/^\d{8}$/.test(raw)) {
      const y = parseInt(raw.slice(0, 4), 10)
      const m = parseInt(raw.slice(4, 6), 10) - 1
      const d = parseInt(raw.slice(6, 8), 10)
      const dt = new Date(y, m, d, 0, 0, 0, 0)
      if (isNaN(dt.getTime())) {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, 'billDate 格式非法')
      }
      return dt
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const dt = new Date(`${raw}T00:00:00`)
      if (isNaN(dt.getTime())) {
        throw new BusinessException(BizErrorCode.PARAM_INVALID, 'billDate 格式非法')
      }
      return dt
    }
    throw new BusinessException(
      BizErrorCode.PARAM_INVALID,
      'billDate 必须为 yyyyMMdd 或 yyyy-MM-dd'
    )
  }

  /**
   * Date → yyyy-MM-dd
   */
  private formatYmd(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
}
