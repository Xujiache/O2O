/**
 * @file admin-export.processor.ts
 * @stage P9 Sprint 4 / W4.B.1
 * @desc 管理后台异步导出 Worker：BullMQ 消费 + exceljs 生成 + MinIO 上传 + presigned URL
 * @author 单 Agent V2.0（Sprint 4 Agent B）
 *
 * 队列：admin-export-queue（concurrency=2，独立 Worker，与 orchestration / dispatch 队列隔离）
 *
 * 流程：
 *   1) 接 BullMQ Job → 读 Redis 状态（AdminExportService.readState）
 *   2) 若状态已是 CANCELED / SUCCESS / FAILED → 幂等跳过
 *   3) patch RUNNING
 *   4) 按 module 分发取数据（依赖业务 service 的 listForExport；缺失则 logger.warn 并写 mock 1~2 行注释 TODO P10）
 *   5) exceljs 写 sheet → buffer
 *   6) MinIO 上传：bucket=`o2o-private`（配置 file.privateBucket）
 *      路径：exports/{adminId}/{yyyyMMdd}/{jobId}.xlsx
 *   7) presignedGetObject TTL=1h
 *   8) patch SUCCESS + downloadUrl
 *   9) 任意阶段异常 → patch FAILED + errorMsg + logger.error
 *
 * 注入：
 *   - AdminExportService（状态机读写）
 *   - StorageAdapter（OSS IO）
 *   - ConfigService（bucket 名）
 */

import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Job } from 'bullmq'
import ExcelJS from 'exceljs'
import { STORAGE_ADAPTER, type StorageAdapter } from '@/modules/file/adapters/storage.adapter'
import {
  ADMIN_EXPORT_JOB_NAME,
  ADMIN_EXPORT_QUEUE,
  AdminExportService,
  type AdminExportJobData,
  type ExportJobState
} from '../services/admin-export.service'

/** Presigned URL TTL：1 小时 */
const PRESIGN_TTL_SEC = 3600

/**
 * 单元 Sheet 行的通用类型；processor 内部把 service.listForExport 的返回归一为
 * `{ headers: string[]; rows: Array<Record<string, unknown>> }`
 */
interface ExportDataset {
  sheetName: string
  headers: string[]
  rows: Array<Record<string, unknown>>
}

@Injectable()
@Processor(ADMIN_EXPORT_QUEUE, { concurrency: 2 })
export class AdminExportProcessor extends WorkerHost {
  private readonly logger = new Logger(AdminExportProcessor.name)
  private readonly privateBucket: string

  constructor(
    private readonly exportService: AdminExportService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly config: ConfigService
  ) {
    super()
    this.privateBucket = this.config.get<string>('file.privateBucket', 'o2o-private')
  }

  /**
   * BullMQ 入口：消费 admin-export job
   *
   * 入参：job BullMQ Job<AdminExportJobData>
   * 返回：{ status: 'SUCCESS' | 'CANCELED' | 'FAILED' | 'SKIPPED' }
   *
   * 异常吞表（不抛给 BullMQ 重试，attempts 已在 service 端固定为 1）：
   *   - 任何步骤异常 → patch FAILED + return { status:'FAILED' }
   */
  async process(job: Job<AdminExportJobData>): Promise<{ status: string }> {
    if (job.name !== ADMIN_EXPORT_JOB_NAME) {
      return { status: 'SKIPPED' }
    }

    const data = job.data
    const jobId = data.jobId

    /* 幂等检查：若已被取消或终态，直接跳过 */
    const before = await this.exportService.readState(jobId)
    if (!before) {
      this.logger.warn(`[admin-export] state 不存在 jobId=${jobId}（可能 TTL 已过）`)
      return { status: 'SKIPPED' }
    }
    if (before.status === 'CANCELED' || before.status === 'SUCCESS' || before.status === 'FAILED') {
      this.logger.log(`[admin-export] 跳过 jobId=${jobId} status=${before.status}`)
      return { status: before.status }
    }

    /* 标记 RUNNING */
    await this.exportService.patchState(jobId, { status: 'RUNNING' })

    try {
      /* 1. 取业务数据集 */
      const dataset = await this.fetchDataset(data)

      /* 2. 生成 xlsx Buffer */
      const buffer = await this.buildWorkbook(dataset)

      /* 3. 上传 MinIO */
      const objectKey = this.buildObjectKey(data.adminId, jobId)
      await this.storage.putObject({
        bucket: this.privateBucket,
        objectKey,
        body: buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })

      /* 4. presigned GET URL TTL=1h */
      const url = await this.storage.presignGetUrl({
        bucket: this.privateBucket,
        objectKey,
        expiresSec: PRESIGN_TTL_SEC
      })

      /* 5. SUCCESS 回写 */
      const finalState: Partial<Omit<ExportJobState, 'jobId' | 'createdAt'>> = {
        status: 'SUCCESS',
        downloadUrl: url
      }
      await this.exportService.patchState(jobId, finalState)
      this.logger.log(
        `[admin-export] SUCCESS jobId=${jobId} module=${data.module} rows=${dataset.rows.length}`
      )
      return { status: 'SUCCESS' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[admin-export] FAILED jobId=${jobId}：${msg}`)
      await this.exportService.patchState(jobId, {
        status: 'FAILED',
        errorMsg: msg.slice(0, 500)
      })
      return { status: 'FAILED' }
    }
  }

  /* ==========================================================================
   * 数据装配（按 module 分发）
   * ========================================================================== */

  /**
   * 按 module 分发取数据。
   *
   * 当前阶段：业务 service.listForExport 尚未在各域统一落地，本 method 走 mock 1~2 行
   * （TODO P10 切换到真聚合：注入 OrderService / MerchantService / RiderService /
   *  AccountService 并调 listForExport(query)）
   *
   * 入参：data 任务 payload
   * 返回：ExportDataset
   */
  private async fetchDataset(data: AdminExportJobData): Promise<ExportDataset> {
    /* TODO P10：替换为真业务 service.listForExport(data.query) 调用 */
    switch (data.module) {
      case 'order':
        return {
          sheetName: '订单',
          headers: ['订单号', '订单类型', '商户', '骑手', '实付金额', '完成时间'],
          rows: [
            {
              订单号: 'TODO_P10_REAL',
              订单类型: '外卖',
              商户: 'TODO',
              骑手: 'TODO',
              实付金额: '0.00',
              完成时间: ''
            }
          ]
        }
      case 'merchant':
        return {
          sheetName: '商户',
          headers: ['商户ID', '商户名', '城市', '入驻时间', '状态'],
          rows: [{ 商户ID: 'TODO_P10', 商户名: 'TODO', 城市: '', 入驻时间: '', 状态: '' }]
        }
      case 'rider':
        return {
          sheetName: '骑手',
          headers: ['骑手ID', '姓名', '手机号', '在职状态', '入职时间'],
          rows: [{ 骑手ID: 'TODO_P10', 姓名: 'TODO', 手机号: '', 在职状态: '', 入职时间: '' }]
        }
      case 'finance':
        return {
          sheetName: '财务流水',
          headers: ['流水号', '账户ID', '方向', '业务类型', '金额', '余额', '关联单号', '时间'],
          rows: [
            {
              流水号: 'TODO_P10',
              账户ID: '',
              方向: '',
              业务类型: '',
              金额: '0.00',
              余额: '0.00',
              关联单号: '',
              时间: ''
            }
          ]
        }
      default:
        this.logger.warn(`[admin-export] 未知 module=${data.module}，导出空表`)
        return {
          sheetName: 'Unknown',
          headers: ['提示'],
          rows: [{ 提示: `未知 module=${data.module}` }]
        }
    }
  }

  /**
   * 用 ExcelJS 构造 Workbook → Buffer
   * 入参：ExportDataset
   * 返回：Buffer（xlsx 二进制）
   */
  private async buildWorkbook(ds: ExportDataset): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'admin-export'
    wb.created = new Date()
    const sheet = wb.addWorksheet(ds.sheetName)

    sheet.columns = ds.headers.map((h) => ({ header: h, key: h, width: 20 }))
    for (const row of ds.rows) {
      sheet.addRow(row)
    }
    sheet.getRow(1).font = { bold: true }

    const arr = await wb.xlsx.writeBuffer()
    /* exceljs 返回 ArrayBuffer 或 Node Buffer 兼容；归一为 Node Buffer */
    return Buffer.isBuffer(arr) ? arr : Buffer.from(arr as ArrayBuffer)
  }

  /**
   * 构造 OSS objectKey：exports/{adminId}/{yyyyMMdd}/{jobId}.xlsx
   */
  private buildObjectKey(adminId: string, jobId: string): string {
    const d = new Date()
    const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}`
    return `exports/${adminId}/${yyyymmdd}/${jobId}.xlsx`
  }
}
