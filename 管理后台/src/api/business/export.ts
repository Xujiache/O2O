/**
 * 异步导出 API
 *
 * 后端暂无 /admin/export/job 端点（P9 补），
 * 当前走 mock 模式或降级为同步 blob 下载。
 *
 * @module api/business/export
 */
import { bizApi } from './_request'
import type { ExportJob } from '@/utils/business/export-async'

export const exportApi = {
  /** 创建任务（P9 待后端补 ExportJobController；当前走 mock） */
  create: (params: {
    module: string
    filters?: Record<string, unknown>
    name?: string
    total?: number
  }) => bizApi.post<{ id: string; total?: number }>('/export/job', params, { needSign: true }),
  /** 查询状态 */
  status: (id: string) => bizApi.get<ExportJob>(`/export/job/${id}`),
  /** 取消任务 */
  cancel: (id: string) => bizApi.del<void>(`/export/job/${id}`)
}
