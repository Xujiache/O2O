/**
 * @file log-query.service.spec.ts
 * @stage P9 Sprint 5 / W5.A.3
 * @desc LogQueryService 单测
 */
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ApiLog, OperationLog } from '@/entities'
import { LogQueryService } from './log-query.service'

interface QueryBuilderMock {
  where: jest.Mock
  andWhere: jest.Mock
  orderBy: jest.Mock
  skip: jest.Mock
  take: jest.Mock
  getManyAndCount: jest.Mock
}

function buildQB(rows: unknown[] = [], total = 0): QueryBuilderMock {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total])
  }
}

describe('LogQueryService', () => {
  let service: LogQueryService
  let opQB: QueryBuilderMock
  let apiQB: QueryBuilderMock

  beforeEach(async () => {
    opQB = buildQB([{ id: 'op-1' }], 1)
    apiQB = buildQB([{ id: 'api-1' }], 1)

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LogQueryService,
        {
          provide: getRepositoryToken(OperationLog),
          useValue: { createQueryBuilder: jest.fn().mockReturnValue(opQB) }
        },
        {
          provide: getRepositoryToken(ApiLog),
          useValue: { createQueryBuilder: jest.fn().mockReturnValue(apiQB) }
        }
      ]
    }).compile()
    service = moduleRef.get(LogQueryService)
  })

  describe('queryOperationLogs', () => {
    it('happy → 返回 PageResult + 调用 createQueryBuilder', async () => {
      const r = await service.queryOperationLogs({})
      expect(r.meta.total).toBe(1)
      expect(r.list).toEqual([{ id: 'op-1' }])
      expect(opQB.where).toHaveBeenCalledWith('l.is_deleted = 0')
      expect(opQB.orderBy).toHaveBeenCalledWith('l.created_at', 'DESC')
    })

    it('keyword 拼装 LIKE 模糊', async () => {
      await service.queryOperationLogs({ keyword: 'admin1' })
      expect(opQB.andWhere).toHaveBeenCalledWith(expect.stringContaining('LIKE :k'), {
        k: '%admin1%'
      })
    })

    it('opAdminId / module / action 精确筛', async () => {
      await service.queryOperationLogs({
        opAdminId: 'A1',
        module: 'merchant',
        action: 'audit'
      })
      expect(opQB.andWhere).toHaveBeenCalledWith('l.op_admin_id = :id', { id: 'A1' })
      expect(opQB.andWhere).toHaveBeenCalledWith('l.module = :m', { m: 'merchant' })
      expect(opQB.andWhere).toHaveBeenCalledWith('l.action = :a', { a: 'audit' })
    })

    it('startAt / endAt 时间范围', async () => {
      await service.queryOperationLogs({
        startAt: '2026-04-01T00:00:00Z',
        endAt: '2026-05-01T00:00:00Z'
      })
      expect(opQB.andWhere).toHaveBeenCalledWith(
        'l.created_at >= :s',
        expect.objectContaining({ s: expect.any(Date) })
      )
      expect(opQB.andWhere).toHaveBeenCalledWith(
        'l.created_at <= :e',
        expect.objectContaining({ e: expect.any(Date) })
      )
    })

    it('startAt 接受 Date 对象', async () => {
      const start = new Date('2026-04-01')
      await service.queryOperationLogs({ startAt: start })
      expect(opQB.andWhere).toHaveBeenCalledWith('l.created_at >= :s', { s: start })
    })

    it('page / pageSize 正常化（page=0 → 1，pageSize=300 → 200 上限）', async () => {
      await service.queryOperationLogs({ page: 0, pageSize: 300 })
      expect(opQB.skip).toHaveBeenCalledWith(0) /* (1-1)*200 */
      expect(opQB.take).toHaveBeenCalledWith(200)
    })

    it('DB 抛错 → 返回空 PageResult（不冒泡）', async () => {
      opQB.getManyAndCount.mockRejectedValueOnce(new Error('db down'))
      const r = await service.queryOperationLogs({})
      expect(r.list).toEqual([])
      expect(r.meta.total).toBe(0)
    })
  })

  describe('queryApiLogs', () => {
    it('happy → 返回 PageResult', async () => {
      const r = await service.queryApiLogs({})
      expect(r.meta.total).toBe(1)
      expect(r.list).toEqual([{ id: 'api-1' }])
    })

    it('keyword 模糊匹配 path / trace_id / error_msg', async () => {
      await service.queryApiLogs({ keyword: '/api/v1/order' })
      expect(apiQB.andWhere).toHaveBeenCalledWith(expect.stringContaining('LIKE :k'), {
        k: '%/api/v1/order%'
      })
    })

    it('traceId / callerType / callerId / method 精确筛', async () => {
      await service.queryApiLogs({
        traceId: 'trace-1',
        callerType: 1,
        callerId: 'U1',
        method: 'post'
      })
      expect(apiQB.andWhere).toHaveBeenCalledWith('l.trace_id = :tid', { tid: 'trace-1' })
      expect(apiQB.andWhere).toHaveBeenCalledWith('l.caller_type = :ct', { ct: 1 })
      expect(apiQB.andWhere).toHaveBeenCalledWith('l.caller_id = :cid', { cid: 'U1' })
      expect(apiQB.andWhere).toHaveBeenCalledWith('l.method = :method', { method: 'POST' })
    })

    it('statusCode 精确筛', async () => {
      await service.queryApiLogs({ statusCode: 500 })
      expect(apiQB.andWhere).toHaveBeenCalledWith('l.status_code = :sc', { sc: 500 })
    })

    it('errorOnly=true 仅看 4xx/5xx', async () => {
      await service.queryApiLogs({ errorOnly: true })
      expect(apiQB.andWhere).toHaveBeenCalledWith('l.status_code >= 400')
    })

    it('DB 抛错 → 空 PageResult', async () => {
      apiQB.getManyAndCount.mockRejectedValueOnce(new Error('mysql gone away'))
      const r = await service.queryApiLogs({})
      expect(r.list).toEqual([])
    })
  })
})
