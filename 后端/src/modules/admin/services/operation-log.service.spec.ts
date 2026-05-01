/**
 * @file operation-log.service.spec.ts
 * @stage P9 Sprint 3 / W3.D.1
 * @desc OperationLogService.writeLog 单测：happy / 截断 / 异常吞掉
 * @author Sprint3-Agent D
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { OperationLog } from '@/entities'
import { OperationLogService } from './operation-log.service'

describe('OperationLogService.writeLog', () => {
  let service: OperationLogService
  let repo: { create: jest.Mock; save: jest.Mock }

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((v: Record<string, unknown>) => v),
      save: jest.fn().mockResolvedValue({})
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OperationLogService,
        { provide: getRepositoryToken(OperationLog), useValue: repo }
      ]
    }).compile()
    service = moduleRef.get(OperationLogService)
  })

  it('happy 路径：正常写入 entity（含 ip / userAgent / requestParams）', async () => {
    await service.writeLog({
      adminId: 'A1',
      adminName: 'Alice',
      action: 'audit',
      resource: 'merchant',
      resourceId: 'M1',
      method: 'POST',
      path: '/api/v1/admin/merchant/M1/audit',
      payload: { reason: 'ok' },
      result: 'SUCCESS',
      ip: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
      traceId: 'trace-x'
    })
    expect(repo.create).toHaveBeenCalledTimes(1)
    expect(repo.save).toHaveBeenCalledTimes(1)
    const arg = repo.create.mock.calls[0][0] as Record<string, unknown>
    expect(arg.opAdminId).toBe('A1')
    expect(arg.opAdminName).toBe('Alice')
    expect(arg.module).toBe('merchant')
    expect(arg.action).toBe('audit')
    expect(arg.resourceType).toBe('merchant')
    expect(arg.resourceId).toBe('M1')
    expect(arg.requestMethod).toBe('POST')
    expect(arg.requestUrl).toBe('/api/v1/admin/merchant/M1/audit')
    expect(arg.isSuccess).toBe(1)
    expect(arg.userAgent).toBe('Mozilla/5.0')
    expect(arg.clientIp).toBeInstanceOf(Buffer)
    const params = arg.requestParams as { body?: unknown; _traceId?: string }
    expect(params.body).toEqual({ reason: 'ok' })
    expect(params._traceId).toBe('trace-x')
  })

  it('FAIL 结果：isSuccess=0 + 截断 errorMsg', async () => {
    await service.writeLog({
      adminId: 'A2',
      action: 'create',
      resource: 'order',
      method: 'PUT',
      path: '/admin/order',
      result: 'FAIL',
      errorMsg: 'x'.repeat(2000)
    })
    const arg = repo.create.mock.calls[0][0] as Record<string, unknown>
    expect(arg.isSuccess).toBe(0)
    expect(String(arg.errorMsg).length).toBe(1000)
  })

  it('payload 超过 64KB → 截断 + truncated=true', async () => {
    const huge = 'x'.repeat(70 * 1024)
    await service.writeLog({
      adminId: 'A3',
      action: 'import',
      resource: 'banner',
      method: 'POST',
      path: '/admin/banner/import',
      payload: { data: huge }
    })
    const arg = repo.create.mock.calls[0][0] as Record<string, unknown>
    const params = arg.requestParams as { body?: unknown; truncated?: boolean }
    expect(params.truncated).toBe(true)
    expect(typeof params.body).toBe('string')
    expect((params.body as string).length).toBeLessThanOrEqual(64 * 1024)
  })

  it('repo.save 抛错 → 吞异常 + 不向上抛', async () => {
    repo.save.mockRejectedValueOnce(new Error('DB down'))
    /* 不应抛 */
    await expect(
      service.writeLog({
        adminId: 'A4',
        action: 'delete',
        resource: 'role',
        method: 'DELETE',
        path: '/admin/system/role/123'
      })
    ).resolves.toBeUndefined()
  })

  it('module 推导：从 path 二级 segment 取', async () => {
    await service.writeLog({
      adminId: 'A5',
      action: 'list',
      resource: 'order',
      method: 'POST',
      path: '/api/v1/admin/order/search'
    })
    const arg = repo.create.mock.calls[0][0] as Record<string, unknown>
    expect(arg.module).toBe('order')
  })

  it('IP IPv4 → 4 字节 Buffer', async () => {
    await service.writeLog({
      adminId: 'A6',
      action: 'get',
      resource: 'admin',
      method: 'POST',
      path: '/admin/x',
      ip: '192.168.1.1'
    })
    const arg = repo.create.mock.calls[0][0] as Record<string, unknown>
    const buf = arg.clientIp as Buffer
    expect(buf.length).toBe(4)
    expect(buf[0]).toBe(192)
    expect(buf[3]).toBe(1)
  })
})
