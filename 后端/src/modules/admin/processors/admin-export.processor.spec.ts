/**
 * @file admin-export.processor.spec.ts
 * @stage P9 Sprint 4 / W4.B.1
 * @desc AdminExportProcessor 单测：状态机分支 + 上传调用
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import type { Job } from 'bullmq'
import { STORAGE_ADAPTER } from '@/modules/file/adapters/storage.adapter'
import {
  ADMIN_EXPORT_JOB_NAME,
  AdminExportService,
  type AdminExportJobData,
  type ExportJobState
} from '../services/admin-export.service'
import { AdminExportProcessor } from './admin-export.processor'

function makeJob(data: AdminExportJobData, name = ADMIN_EXPORT_JOB_NAME): Job<AdminExportJobData> {
  return { name, data } as unknown as Job<AdminExportJobData>
}

describe('AdminExportProcessor', () => {
  let processor: AdminExportProcessor
  let exportService: {
    readState: jest.Mock
    patchState: jest.Mock
  }
  let storage: {
    putObject: jest.Mock
    presignGetUrl: jest.Mock
  }

  beforeEach(async () => {
    exportService = {
      readState: jest.fn(),
      patchState: jest.fn().mockResolvedValue(null)
    }
    storage = {
      putObject: jest.fn().mockResolvedValue({ bucket: 'b', objectKey: 'k', size: 1 }),
      presignGetUrl: jest.fn().mockResolvedValue('https://signed/x.xlsx')
    }
    const config = {
      get: (_k: string, fallback: string) => fallback
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminExportProcessor,
        { provide: AdminExportService, useValue: exportService },
        { provide: STORAGE_ADAPTER, useValue: storage },
        { provide: ConfigService, useValue: config }
      ]
    }).compile()

    processor = moduleRef.get(AdminExportProcessor)
  })

  /* ------------------------------------------------------------------ */

  it('jobName 不匹配 → SKIPPED，不读 state', async () => {
    const r = await processor.process(
      makeJob({ jobId: 'J', module: 'order', query: {}, adminId: 'A' }, 'other-job-name')
    )
    expect(r.status).toBe('SKIPPED')
    expect(exportService.readState).not.toHaveBeenCalled()
  })

  it('Redis 中状态不存在 → SKIPPED', async () => {
    exportService.readState.mockResolvedValue(null)
    const r = await processor.process(
      makeJob({ jobId: 'J', module: 'order', query: {}, adminId: 'A' })
    )
    expect(r.status).toBe('SKIPPED')
  })

  it('已 CANCELED → 幂等跳过，不上传', async () => {
    const state: ExportJobState = {
      jobId: 'J',
      status: 'CANCELED',
      module: 'order',
      query: {},
      adminId: 'A',
      createdAt: 1,
      updatedAt: 2
    }
    exportService.readState.mockResolvedValue(state)
    const r = await processor.process(
      makeJob({ jobId: 'J', module: 'order', query: {}, adminId: 'A' })
    )
    expect(r.status).toBe('CANCELED')
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it('PENDING → 全流程 SUCCESS（mock 数据集 + 上传 + 签名）', async () => {
    const state: ExportJobState = {
      jobId: 'J1',
      status: 'PENDING',
      module: 'order',
      query: {},
      adminId: 'A1',
      createdAt: 1,
      updatedAt: 2
    }
    exportService.readState.mockResolvedValue(state)
    const r = await processor.process(
      makeJob({ jobId: 'J1', module: 'order', query: {}, adminId: 'A1' })
    )
    expect(r.status).toBe('SUCCESS')
    /* RUNNING + SUCCESS 至少 2 次 patch */
    expect(exportService.patchState).toHaveBeenCalledTimes(2)
    expect(exportService.patchState.mock.calls[0][1]).toEqual({ status: 'RUNNING' })
    const finalPatch = exportService.patchState.mock.calls[1][1]
    expect(finalPatch.status).toBe('SUCCESS')
    expect(finalPatch.downloadUrl).toBe('https://signed/x.xlsx')
    expect(storage.putObject).toHaveBeenCalledTimes(1)
    const putArg = storage.putObject.mock.calls[0][0]
    expect(putArg.bucket).toBe('o2o-private')
    expect(putArg.objectKey).toMatch(/^exports\/A1\/\d{8}\/J1\.xlsx$/)
    expect(storage.presignGetUrl).toHaveBeenCalledTimes(1)
    expect(storage.presignGetUrl.mock.calls[0][0].expiresSec).toBe(3600)
  })

  it('上传抛错 → patch FAILED + errorMsg', async () => {
    const state: ExportJobState = {
      jobId: 'J2',
      status: 'PENDING',
      module: 'finance',
      query: {},
      adminId: 'A1',
      createdAt: 1,
      updatedAt: 2
    }
    exportService.readState.mockResolvedValue(state)
    storage.putObject.mockRejectedValue(new Error('s3 502'))
    const r = await processor.process(
      makeJob({ jobId: 'J2', module: 'finance', query: {}, adminId: 'A1' })
    )
    expect(r.status).toBe('FAILED')
    /* RUNNING + FAILED */
    const calls = exportService.patchState.mock.calls
    const last = calls[calls.length - 1][1]
    expect(last.status).toBe('FAILED')
    expect(last.errorMsg).toContain('s3 502')
  })

  it('未知 module → 仍能产出空表 SUCCESS', async () => {
    const state: ExportJobState = {
      jobId: 'J3',
      status: 'PENDING',
      module: 'wat',
      query: {},
      adminId: 'A1',
      createdAt: 1,
      updatedAt: 2
    }
    exportService.readState.mockResolvedValue(state)
    const r = await processor.process(
      makeJob({ jobId: 'J3', module: 'wat', query: {}, adminId: 'A1' })
    )
    expect(r.status).toBe('SUCCESS')
  })
})
