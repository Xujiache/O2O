/**
 * 异步导出 API
 * @module api/business/export
 */
import { bizApi } from './_request'
import type { ExportJob } from '@/utils/business/export-async'

export const exportApi = {
  /** 创建任务（业务方传 module + filters） */
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
