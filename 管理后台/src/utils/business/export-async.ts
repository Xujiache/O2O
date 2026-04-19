/**
 * 异步导出任务：≥1000 条记录走后端任务，5s 轮询任务状态，完成后下载
 *
 * 【ACCEPTANCE V8.19】≥ 1000 条 → 异步生成 + 完成下载
 *
 * @module utils/business/export-async
 */
import { ElNotification } from 'element-plus'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'

/** 异步导出任务记录 */
export interface ExportJob {
  /** 任务 id（后端返回） */
  id: string
  /** 任务名称（业务描述） */
  name: string
  /** 状态：0 排队 / 1 处理中 / 2 完成 / 3 失败 / 4 已取消 */
  status: 0 | 1 | 2 | 3 | 4
  /** 进度 0-100 */
  progress: number
  /** 总数 */
  total: number
  /** 完成下载链接 */
  url?: string
  /** 错误消息 */
  error?: string
  /** 创建时间 ms */
  createdAt: number
  /** 完成时间 ms */
  finishedAt?: number
}

/** 后端导出 API 接口契约 */
export interface ExportAsyncApi {
  /** 创建任务，返回 jobId */
  create: (params: Record<string, unknown>) => Promise<{ id: string; total?: number }>
  /** 查询任务状态 */
  status: (id: string) => Promise<ExportJob>
  /** 取消任务 */
  cancel: (id: string) => Promise<void>
}

const POLL_INTERVAL = 5000
const POLL_MAX_TIMES = 600

/**
 * 同步小数据导出（< 1000 行）：前端直接 xlsx 生成 + file-saver 下载
 *
 * @param rows 数据
 * @param filename 文件名（含 .xlsx）
 * @param sheetName sheet 名称
 */
export function exportSyncXlsx<T extends Record<string, unknown>>(
  rows: T[],
  filename = `export-${Date.now()}.xlsx`,
  sheetName = 'Sheet1'
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  const buf = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  saveAs(blob, filename)
}

/**
 * 同步 CSV 导出
 */
export function exportSyncCsv<T extends Record<string, unknown>>(
  rows: T[],
  filename = `export-${Date.now()}.csv`
): void {
  if (!rows.length) {
    saveAs(new Blob(['\uFEFF'], { type: 'text/csv;charset=utf-8' }), filename)
    return
  }
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  rows.forEach((row) => {
    const line = headers
      .map((h) => {
        const v = row[h]
        if (v === null || v === undefined) return ''
        const s = String(v).replace(/"/g, '""')
        return /[",\n]/.test(s) ? `"${s}"` : s
      })
      .join(',')
    lines.push(line)
  })
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  saveAs(blob, filename)
}

/**
 * 异步导出任务执行：创建任务 + 5s 轮询 + 完成下载 + 通知
 *
 * @param api 后端导出 API
 * @param params 创建任务参数
 * @param opts 选项
 * @returns 完成的 ExportJob（或抛错 / 取消）
 */
export async function runExportAsync(
  api: ExportAsyncApi,
  params: Record<string, unknown>,
  opts: {
    /** 任务名（业务描述，用于通知） */
    name?: string
    /** 任务进度回调 */
    onProgress?: (job: ExportJob) => void
    /** 是否在完成时自动 window.open 下载 */
    autoDownload?: boolean
    /** 用于注册取消信号 */
    signal?: AbortSignal
  } = {}
): Promise<ExportJob> {
  const { name = '数据导出', onProgress, autoDownload = true, signal } = opts
  const created = await api.create(params)
  const jobId = created.id
  let times = 0
  let lastJob: ExportJob = {
    id: jobId,
    name,
    status: 0,
    progress: 0,
    total: created.total || 0,
    createdAt: Date.now()
  }
  onProgress?.(lastJob)

  return await new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      if (signal?.aborted) {
        clearInterval(timer)
        try {
          await api.cancel(jobId)
        } catch {
          /* ignore */
        }
        const cancelled: ExportJob = { ...lastJob, status: 4, finishedAt: Date.now() }
        onProgress?.(cancelled)
        reject(new Error('已取消'))
        return
      }
      times++
      if (times > POLL_MAX_TIMES) {
        clearInterval(timer)
        const failed: ExportJob = {
          ...lastJob,
          status: 3,
          error: '轮询超时',
          finishedAt: Date.now()
        }
        onProgress?.(failed)
        ElNotification.error({ title: name, message: '导出超时，请稍后重试' })
        reject(new Error('轮询超时'))
        return
      }
      try {
        const job = await api.status(jobId)
        lastJob = job
        onProgress?.(job)
        if (job.status === 2) {
          clearInterval(timer)
          if (autoDownload && job.url) {
            window.open(job.url, '_blank', 'noopener,noreferrer')
          }
          ElNotification.success({
            title: name,
            message: `导出完成（共 ${job.total} 条）`,
            duration: 3000
          })
          resolve(job)
        } else if (job.status === 3) {
          clearInterval(timer)
          ElNotification.error({ title: name, message: job.error || '导出失败' })
          reject(new Error(job.error || '导出失败'))
        } else if (job.status === 4) {
          clearInterval(timer)
          reject(new Error('已取消'))
        }
      } catch (e) {
        // 单次轮询失败不立即终止，继续重试
        console.warn('[exportAsync] 轮询失败', e)
      }
    }, POLL_INTERVAL)
  })
}
