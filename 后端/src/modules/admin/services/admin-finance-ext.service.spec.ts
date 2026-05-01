/**
 * @file admin-finance-ext.service.spec.ts
 * @stage P9 Sprint 4 / W4.B.2
 * @desc AdminFinanceExtService 单测：聚合查询 / 账单分页 / 重试分支
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { BusinessException } from '@/common'
import { SettlementRecord } from '@/entities'
import { SettlementService } from '@/modules/finance/services/settlement.service'
import { AdminFinanceExtService } from './admin-finance-ext.service'

describe('AdminFinanceExtService', () => {
  let service: AdminFinanceExtService
  let dataSource: { query: jest.Mock }
  let recordRepo: { findOne: jest.Mock; save: jest.Mock }
  let settlementService: { execute: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    recordRepo = { findOne: jest.fn(), save: jest.fn().mockResolvedValue({}) }
    settlementService = { execute: jest.fn() }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminFinanceExtService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(SettlementRecord), useValue: recordRepo },
        { provide: SettlementService, useValue: settlementService }
      ]
    }).compile()

    service = moduleRef.get(AdminFinanceExtService)
  })

  /* ------------------------------------------------------------------ */

  describe('getOverview', () => {
    it('happy：4 段聚合 + 7 日趋势（trend.length===7）', async () => {
      /* 顺序：income / commission / refund / balance / income-trend / comm-trend / refund-trend */
      dataSource.query
        .mockResolvedValueOnce([{ s: '100.50' }])
        .mockResolvedValueOnce([{ s: '20' }])
        .mockResolvedValueOnce([{ s: '5.55' }])
        .mockResolvedValueOnce([{ s: '999' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const r = await service.getOverview({})
      expect(r.income).toBe('100.50')
      expect(r.commission).toBe('20.00')
      expect(r.refund).toBe('5.55')
      expect(r.balance).toBe('999.00')
      expect(r.trend.length).toBe(7)
      r.trend.forEach((t) => {
        expect(t.income).toBe('0.00')
        expect(t.commission).toBe('0.00')
        expect(t.refund).toBe('0.00')
      })
    })

    it('null 输入金额 → 归一为 0.00', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ s: null }])
        .mockResolvedValueOnce([{ s: null }])
        .mockResolvedValueOnce([{ s: null }])
        .mockResolvedValueOnce([{ s: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      const r = await service.getOverview({})
      expect(r.income).toBe('0.00')
      expect(r.balance).toBe('0.00')
    })

    it('trend rows 命中 → income 字段替换默认 0.00', async () => {
      const today = new Date()
      const yyyy = today.getFullYear()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const todayStr = `${yyyy}-${mm}-${dd}`

      dataSource.query
        .mockResolvedValueOnce([{ s: '0' }])
        .mockResolvedValueOnce([{ s: '0' }])
        .mockResolvedValueOnce([{ s: '0' }])
        .mockResolvedValueOnce([{ s: '0' }])
        .mockResolvedValueOnce([{ d: todayStr, s: '88' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      const r = await service.getOverview({})
      const todayRow = r.trend.find((t) => t.date === todayStr)
      expect(todayRow?.income).toBe('88.00')
    })
  })

  /* ------------------------------------------------------------------ */

  describe('getBillList', () => {
    it('默认分页 page=1 / size=20，传过滤参数', async () => {
      dataSource.query.mockResolvedValueOnce([{ c: 30 }]).mockResolvedValueOnce([
        {
          id: '1',
          flow_no: 'F1',
          account_id: 'AC1',
          owner_type: 2,
          owner_id: 'O1',
          direction: 1,
          biz_type: 3,
          amount: '10.00',
          balance_after: '100.00',
          related_no: 'R1',
          remark: 'r',
          created_at: new Date()
        }
      ])

      const r = await service.getBillList({
        ownerType: 2,
        bizType: 3,
        direction: 1,
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      })
      expect(r.meta.total).toBe(30)
      expect(r.meta.totalPages).toBe(2)
      expect(r.list.length).toBe(1)
      expect(r.list[0].amount).toBe('10.00')
    })

    it('total=0 → totalPages=0', async () => {
      dataSource.query.mockResolvedValueOnce([{ c: 0 }]).mockResolvedValueOnce([])
      const r = await service.getBillList({})
      expect(r.meta.total).toBe(0)
      expect(r.meta.totalPages).toBe(0)
      expect(r.list).toEqual([])
    })
  })

  /* ------------------------------------------------------------------ */

  describe('retrySettlement', () => {
    it('record 不存在 → BusinessException(NOT_FOUND)', async () => {
      recordRepo.findOne.mockResolvedValue(null)
      await expect(service.retrySettlement('X')).rejects.toBeInstanceOf(BusinessException)
    })

    it('status=1 已执行 → retried=false（无需）', async () => {
      recordRepo.findOne.mockResolvedValue({ id: 'X', orderNo: 'O1', status: 1 })
      const r = await service.retrySettlement('X')
      expect(r.retried).toBe(false)
      expect(r.status).toBe(1)
      expect(settlementService.execute).not.toHaveBeenCalled()
    })

    it('status=3 已撤销 → retried=false', async () => {
      recordRepo.findOne.mockResolvedValue({ id: 'X', orderNo: 'O1', status: 3 })
      const r = await service.retrySettlement('X')
      expect(r.retried).toBe(false)
      expect(r.status).toBe(3)
    })

    it('status=2 失败 → reset + execute → retried=true', async () => {
      const record = {
        id: 'X',
        orderNo: 'O1',
        status: 2,
        errorMsg: 'old err',
        isDeleted: 0
      }
      recordRepo.findOne.mockResolvedValue(record)
      settlementService.execute.mockResolvedValue({
        ...record,
        status: 1,
        errorMsg: null
      })
      const r = await service.retrySettlement('X')
      expect(r.retried).toBe(true)
      expect(r.status).toBe(1)
      expect(recordRepo.save).toHaveBeenCalledTimes(1)
      expect(settlementService.execute).toHaveBeenCalledTimes(1)
    })
  })
})
