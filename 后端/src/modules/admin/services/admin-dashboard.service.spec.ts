/**
 * @file admin-dashboard.service.spec.ts
 * @stage P9 Sprint 4 / W4.C.3
 * @desc AdminDashboardService 单测：overview happy / 空数据 / SQL 异常 + 7 日趋势补齐
 * @author Sprint4-Agent C
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { AdminDashboardService } from './admin-dashboard.service'

describe('AdminDashboardService', () => {
  let service: AdminDashboardService
  let dataSource: { query: jest.Mock }

  beforeEach(async () => {
    dataSource = { query: jest.fn() }
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [AdminDashboardService, { provide: DataSource, useValue: dataSource }]
    }).compile()
    service = moduleRef.get(AdminDashboardService)
  })

  /* ============================================================================
   * overview
   * ============================================================================ */

  describe('overview', () => {
    it('happy：4 项均返回数值/字符串', async () => {
      /* 4 个并行 query：cnt / gmv / activeUsers / activeRiders */
      dataSource.query
        .mockResolvedValueOnce([{ cnt: 12 }]) /* todayOrderCount */
        .mockResolvedValueOnce([{ gmv: '1234.56' }]) /* todayGmv */
        .mockResolvedValueOnce([{ cnt: 88 }]) /* activeUsers */
        .mockResolvedValueOnce([{ cnt: 7 }]) /* activeRiders */

      const ret = await service.overview()
      expect(ret.todayOrderCount).toBe(12)
      expect(ret.todayGmv).toBe('1234.56')
      expect(ret.activeUsers).toBe(88)
      expect(ret.activeRiders).toBe(7)
      expect(typeof ret.generatedAt).toBe('string')
    })

    it('空数据：所有项返回 0 / 0.00', async () => {
      dataSource.query
        .mockResolvedValueOnce([]) /* cnt 行不存在 */
        .mockResolvedValueOnce([{ gmv: 0 }])
        .mockResolvedValueOnce([{ cnt: null }])
        .mockResolvedValueOnce([])

      const ret = await service.overview()
      expect(ret.todayOrderCount).toBe(0)
      expect(ret.todayGmv).toBe('0.00')
      expect(ret.activeUsers).toBe(0)
      expect(ret.activeRiders).toBe(0)
    })

    it('SQL 异常：单项失败兜底 0，整体不抛', async () => {
      dataSource.query
        .mockRejectedValueOnce(new Error('table missing'))
        .mockRejectedValueOnce(new Error('table missing'))
        .mockRejectedValueOnce(new Error('table missing'))
        .mockRejectedValueOnce(new Error('dispatch_record down'))

      const ret = await service.overview()
      expect(ret.todayOrderCount).toBe(0)
      expect(ret.todayGmv).toBe('0.00')
      expect(ret.activeUsers).toBe(0)
      expect(ret.activeRiders).toBe(0)
    })

    it('SQL 异常：单项失败其他正常仍返回真实值', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ cnt: 5 }])
        .mockRejectedValueOnce(new Error('table missing'))
        .mockResolvedValueOnce([{ cnt: 10 }])
        .mockResolvedValueOnce([{ cnt: 3 }])

      const ret = await service.overview()
      expect(ret.todayOrderCount).toBe(5)
      expect(ret.todayGmv).toBe('0.00')
      expect(ret.activeUsers).toBe(10)
      expect(ret.activeRiders).toBe(3)
    })
  })

  /* ============================================================================
   * trend
   * ============================================================================ */

  describe('trend', () => {
    it('happy：返回 7 个点（按日期升序）', async () => {
      const today = new Date()
      const yyyymmdd = (d: Date): string => {
        const y = d.getFullYear()
        const m = (d.getMonth() + 1).toString().padStart(2, '0')
        const day = d.getDate().toString().padStart(2, '0')
        return `${y}-${m}-${day}`
      }
      const t0 = new Date(today)
      t0.setDate(today.getDate() - 6)
      const t6 = new Date(today)

      dataSource.query.mockResolvedValueOnce([
        { date_str: yyyymmdd(t0), cnt: 5, gmv: '100.00' },
        { date_str: yyyymmdd(t6), cnt: 8, gmv: '200.00' }
      ])

      const ret = await service.trend()
      expect(ret).toHaveLength(7)
      expect(ret[0].date).toBe(yyyymmdd(t0))
      expect(ret[0].orderCount).toBe(5)
      expect(ret[0].gmv).toBe('100.00')
      expect(ret[6].date).toBe(yyyymmdd(t6))
      expect(ret[6].orderCount).toBe(8)
      expect(ret[6].gmv).toBe('200.00')
      /* 中间日期补 0 */
      expect(ret[3].orderCount).toBe(0)
      expect(ret[3].gmv).toBe('0.00')
    })

    it('空数据：返回 7 个 zero 点', async () => {
      dataSource.query.mockResolvedValueOnce([])
      const ret = await service.trend()
      expect(ret).toHaveLength(7)
      for (const p of ret) {
        expect(p.orderCount).toBe(0)
        expect(p.gmv).toBe('0.00')
      }
    })

    it('SQL 异常：兜底 7 个 zero 点（不抛）', async () => {
      dataSource.query.mockRejectedValueOnce(new Error('SQL fail'))
      const ret = await service.trend()
      expect(ret).toHaveLength(7)
      expect(ret.every((p) => p.orderCount === 0 && p.gmv === '0.00')).toBe(true)
    })

    it('日期返回 Date 对象时正常归一化', async () => {
      const today = new Date()
      const t0 = new Date(today)
      t0.setDate(today.getDate() - 6)

      dataSource.query.mockResolvedValueOnce([{ date_str: t0, cnt: '3', gmv: 50 }])
      const ret = await service.trend()
      expect(ret).toHaveLength(7)
      expect(ret[0].orderCount).toBe(3)
      expect(ret[0].gmv).toBe('50.00')
    })
  })
})
