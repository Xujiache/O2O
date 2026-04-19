/**
 * 异步导出任务 store：用于"导出中心"展示当前所有进行中 / 历史任务
 *
 * @module store/modules/business/export-job
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ExportAsyncApi, ExportJob } from '@/utils/business/export-async'
import { exportApi } from '@/api/business'
import { runExportAsync } from '@/utils/business/export-async'
import { STORAGE_KEYS, bizGet, bizSet } from '@/utils/business/storage-keys'

const MAX_HISTORY = 50

export const useBizExportJobStore = defineStore('bizExportJob', () => {
  const jobs = ref<ExportJob[]>(bizGet<ExportJob[]>(STORAGE_KEYS.EXPORT_JOBS, []))

  const persist = (): void => {
    bizSet(STORAGE_KEYS.EXPORT_JOBS, jobs.value.slice(0, MAX_HISTORY))
  }

  const upsert = (job: ExportJob): void => {
    const idx = jobs.value.findIndex((j) => j.id === job.id)
    if (idx >= 0) jobs.value[idx] = job
    else jobs.value.unshift(job)
    persist()
  }

  /**
   * 创建并轮询任务
   * @param params 业务方传 module + filters + name + total
   */
  const startJob = async (params: {
    module: string
    filters?: Record<string, unknown>
    name?: string
    total?: number
  }): Promise<ExportJob> => {
    const apiAdapter: ExportAsyncApi = {
      create: (p) =>
        exportApi.create(
          p as { module: string; filters?: Record<string, unknown>; name?: string; total?: number }
        ),
      status: (id) => exportApi.status(id),
      cancel: (id) => exportApi.cancel(id)
    }
    const job = await runExportAsync(apiAdapter, params as Record<string, unknown>, {
      name: params.name,
      onProgress: (j) => upsert(j)
    })
    return job
  }

  const cancelJob = async (id: string): Promise<void> => {
    await exportApi.cancel(id)
    const j = jobs.value.find((x) => x.id === id)
    if (j) {
      j.status = 4
      j.finishedAt = Date.now()
      persist()
    }
  }

  const clear = (): void => {
    jobs.value = []
    persist()
  }

  return { jobs, startJob, cancelJob, clear, upsert }
})
