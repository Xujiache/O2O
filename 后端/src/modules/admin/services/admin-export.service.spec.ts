/**
 * @file admin-export.service.spec.ts
 * @stage P9 Sprint 4 / W4.B.1
 * @desc AdminExportService 单测：createJob / getJob / cancelJob / patchState
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { ADMIN_EXPORT_QUEUE, AdminExportService, type ExportJobState } from './admin-export.service'

describe('AdminExportService', () => {
  let service: AdminExportService
  let redis: {
    get: jest.Mock
    set: jest.Mock
  }
  let queue: { add: jest.Mock }

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK')
    }
    queue = { add: jest.fn().mockResolvedValue({ id: 'bullmq-1' }) }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminExportService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getQueueToken(ADMIN_EXPORT_QUEUE), useValue: queue }
      ]
    }).compile()

    service = moduleRef.get(AdminExportService)
  })

  /* ------------------------------------------------------------------ */

  describe('createJob', () => {
    it('happy：写 Redis + enqueue + 返回 jobId', async () => {
      const r = await service.createJob({ module: 'order', query: { a: 1 }, adminId: 'A1' })
      expect(r.jobId).toMatch(/^\d{14}[a-z0-9]{6}$/)
      expect(redis.set).toHaveBeenCalledTimes(1)
      const [key, val, mode, ttl] = redis.set.mock.calls[0]
      expect(key).toBe(`export:job:${r.jobId}`)
      expect(mode).toBe('EX')
      expect(ttl).toBe(86400)
      const state = JSON.parse(val) as ExportJobState
      expect(state.status).toBe('PENDING')
      expect(state.module).toBe('order')
      expect(state.adminId).toBe('A1')
      expect(queue.add).toHaveBeenCalledTimes(1)
      expect(queue.add.mock.calls[0][0]).toBe('admin-export')
    })

    it('queue.add 抛错 → patch FAILED', async () => {
      queue.add.mockRejectedValueOnce(new Error('redis down'))
      /* readState 返回 state 以便 patchState 可读 */
      redis.get.mockImplementation((key: string) => {
        const calls = redis.set.mock.calls
        if (calls.length === 0) return Promise.resolve(null)
        const last = calls[calls.length - 1][1] as string
        return Promise.resolve(last)
      })

      const r = await service.createJob({ module: 'order', query: {}, adminId: 'A2' })
      expect(r.jobId).toBeDefined()
      /* set 被调用 2 次：一次 PENDING + 一次 FAILED 覆盖写 */
      expect(redis.set).toHaveBeenCalledTimes(2)
      const finalVal = redis.set.mock.calls[1][1] as string
      const state = JSON.parse(finalVal) as ExportJobState
      expect(state.status).toBe('FAILED')
      expect(state.errorMsg).toContain('redis down')
    })
  })

  /* ------------------------------------------------------------------ */

  describe('getJob', () => {
    it('Redis 不存在 → status=FAILED + errorMsg', async () => {
      redis.get.mockResolvedValue(null)
      const r = await service.getJob('not-found')
      expect(r.status).toBe('FAILED')
      expect(r.errorMsg).toContain('不存在')
    })

    it('Redis 存在 → 返回 status / downloadUrl', async () => {
      const state: ExportJobState = {
        jobId: 'JOB1',
        status: 'SUCCESS',
        module: 'order',
        query: {},
        adminId: 'A1',
        downloadUrl: 'https://x/y.xlsx',
        createdAt: 1,
        updatedAt: 2
      }
      redis.get.mockResolvedValue(JSON.stringify(state))
      const r = await service.getJob('JOB1')
      expect(r.status).toBe('SUCCESS')
      expect(r.downloadUrl).toBe('https://x/y.xlsx')
    })

    it('Redis 返回脏数据（非 JSON）→ 视为不存在', async () => {
      redis.get.mockResolvedValue('not-json{')
      const r = await service.getJob('JOB-bad')
      expect(r.status).toBe('FAILED')
    })
  })

  /* ------------------------------------------------------------------ */

  describe('cancelJob', () => {
    it('不存在 → canceled=false', async () => {
      redis.get.mockResolvedValue(null)
      const r = await service.cancelJob('xx')
      expect(r.canceled).toBe(false)
    })

    it('已 SUCCESS → 幂等 true，不再写', async () => {
      const state: ExportJobState = {
        jobId: 'J',
        status: 'SUCCESS',
        module: 'order',
        query: {},
        adminId: 'A',
        createdAt: 1,
        updatedAt: 2
      }
      redis.get.mockResolvedValue(JSON.stringify(state))
      const r = await service.cancelJob('J')
      expect(r.canceled).toBe(true)
      expect(redis.set).not.toHaveBeenCalled()
    })

    it('PENDING → 写 CANCELED', async () => {
      const state: ExportJobState = {
        jobId: 'J',
        status: 'PENDING',
        module: 'order',
        query: {},
        adminId: 'A',
        createdAt: 1,
        updatedAt: 2
      }
      redis.get.mockResolvedValue(JSON.stringify(state))
      const r = await service.cancelJob('J')
      expect(r.canceled).toBe(true)
      expect(redis.set).toHaveBeenCalledTimes(1)
      const newState = JSON.parse(redis.set.mock.calls[0][1] as string) as ExportJobState
      expect(newState.status).toBe('CANCELED')
    })
  })

  /* ------------------------------------------------------------------ */

  describe('patchState', () => {
    it('当前 state 不存在 → 返回 null', async () => {
      redis.get.mockResolvedValue(null)
      const r = await service.patchState('x', { status: 'RUNNING' })
      expect(r).toBeNull()
    })

    it('合并字段 + 刷新 updatedAt', async () => {
      const state: ExportJobState = {
        jobId: 'J',
        status: 'PENDING',
        module: 'order',
        query: {},
        adminId: 'A',
        createdAt: 100,
        updatedAt: 100
      }
      redis.get.mockResolvedValue(JSON.stringify(state))
      const r = await service.patchState('J', { status: 'RUNNING' })
      expect(r?.status).toBe('RUNNING')
      expect(r?.createdAt).toBe(100)
      expect((r?.updatedAt ?? 0) >= 100).toBe(true)
    })
  })
})
