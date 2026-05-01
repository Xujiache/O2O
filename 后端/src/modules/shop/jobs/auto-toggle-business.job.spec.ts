/**
 * @file auto-toggle-business.job.spec.ts
 * @stage P9 Sprint 6 / W6.E.4
 * @desc AutoToggleBusinessJob 单测
 * @author 单 Agent V2.0（Sprint 6 Agent E）
 *
 * 关键覆盖：
 *   1) 0 候选 → 不查营业时段 / 不更新
 *   2) 命中营业时段 + 当前关 → UPDATE business_status=1
 *   3) 未命中营业时段 + 当前开 → UPDATE business_status=0
 *   4) 已是目标状态 → skipped 不更新
 *   5) shopRepo.find 抛错 → 全 0
 *   6) hourRepo.createQueryBuilder.getMany 抛错 → 候选店铺全部按「无时段」处理
 *   7) 单店 update 抛错 → failed=1，其他正常
 *   8) handleCron 调 run（覆盖 cron 入口）
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Shop, ShopBusinessHour } from '@/entities'
import { AutoToggleBusinessJob } from './auto-toggle-business.job'

interface UpdateQbMock {
  update: jest.Mock
  set: jest.Mock
  where: jest.Mock
  execute: jest.Mock
}

interface SelectQbMock {
  select: jest.Mock
  where: jest.Mock
  andWhere: jest.Mock
  getMany: jest.Mock
}

interface ShopRepoMock {
  find: jest.Mock
  createQueryBuilder: jest.Mock
}

interface HourRepoMock {
  createQueryBuilder: jest.Mock
}

describe('AutoToggleBusinessJob (W6.E.4)', () => {
  let job: AutoToggleBusinessJob
  let shopRepo: ShopRepoMock
  let hourRepo: HourRepoMock
  let updateQb: UpdateQbMock
  let selectQb: SelectQbMock

  beforeEach(async () => {
    updateQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 })
    }
    selectQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn()
    }
    shopRepo = {
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(updateQb)
    }
    hourRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(selectQb)
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AutoToggleBusinessJob,
        { provide: getRepositoryToken(Shop), useValue: shopRepo },
        { provide: getRepositoryToken(ShopBusinessHour), useValue: hourRepo }
      ]
    }).compile()

    job = moduleRef.get(AutoToggleBusinessJob)
  })

  /** 当前北京时间字符串（HH:mm:ss） */
  function buildNowHHMMSS(): string {
    const now = new Date()
    const beijing = new Date(now.getTime() + now.getTimezoneOffset() * 60 * 1000 + 8 * 3600 * 1000)
    const hh = beijing.getUTCHours().toString().padStart(2, '0')
    const mm = beijing.getUTCMinutes().toString().padStart(2, '0')
    const ss = beijing.getUTCSeconds().toString().padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }

  /** 当前北京时间星期 1~7 */
  function buildNowDow(): number {
    const now = new Date()
    const beijing = new Date(now.getTime() + now.getTimezoneOffset() * 60 * 1000 + 8 * 3600 * 1000)
    const jsDay = beijing.getUTCDay()
    return jsDay === 0 ? 7 : jsDay
  }

  it('0 候选店铺 → 全 0，不查营业时段', async () => {
    shopRepo.find.mockResolvedValueOnce([])
    const r = await job.run()
    expect(r).toEqual({ scanned: 0, opened: 0, closed: 0, skipped: 0, failed: 0 })
    expect(hourRepo.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('shopRepo.find 抛错 → 全 0', async () => {
    shopRepo.find.mockRejectedValueOnce(new Error('DB down'))
    const r = await job.run()
    expect(r).toEqual({ scanned: 0, opened: 0, closed: 0, skipped: 0, failed: 0 })
  })

  it('当前关，时段命中 → 切换为 1（opened）', async () => {
    shopRepo.find.mockResolvedValueOnce([{ id: 'S1', businessStatus: 0 }])
    /* 用「全天通用 dayOfWeek=0」的 00:00~23:59:59 区间，必命中 */
    selectQb.getMany.mockResolvedValueOnce([
      { shopId: 'S1', dayOfWeek: 0, openTime: '00:00:00', closeTime: '23:59:59' }
    ])
    const r = await job.run()
    expect(r.scanned).toBe(1)
    expect(r.opened).toBe(1)
    expect(r.closed).toBe(0)
    expect(updateQb.execute).toHaveBeenCalledTimes(1)
    /* 校验 set 的目标 status */
    const setCall = updateQb.set.mock.calls[0][0]
    expect(setCall.businessStatus).toBe(1)
  })

  it('当前开，时段未命中 → 切换为 0（closed）', async () => {
    shopRepo.find.mockResolvedValueOnce([{ id: 'S2', businessStatus: 1 }])
    /* 极窄区间 00:00:00~00:00:01；当前几乎不可能命中 */
    selectQb.getMany.mockResolvedValueOnce([
      { shopId: 'S2', dayOfWeek: 0, openTime: '00:00:00', closeTime: '00:00:01' }
    ])
    const nowStr = buildNowHHMMSS()
    /* 显式断言时间不在窄区间内 */
    if (nowStr <= '00:00:01') {
      /* 极小概率命中，跳过 */
      return
    }
    const r = await job.run()
    expect(r.closed).toBe(1)
    expect(r.opened).toBe(0)
    const setCall = updateQb.set.mock.calls[0][0]
    expect(setCall.businessStatus).toBe(0)
  })

  it('当前关 + 无营业时段 → 仍为 0（skipped 不写库）', async () => {
    shopRepo.find.mockResolvedValueOnce([{ id: 'S3', businessStatus: 0 }])
    selectQb.getMany.mockResolvedValueOnce([])
    const r = await job.run()
    expect(r.skipped).toBe(1)
    expect(r.opened).toBe(0)
    expect(r.closed).toBe(0)
    expect(updateQb.execute).not.toHaveBeenCalled()
  })

  it('当前开 + 当前 dayOfWeek 命中 → skipped（已经是 OPEN）', async () => {
    shopRepo.find.mockResolvedValueOnce([{ id: 'S4', businessStatus: 1 }])
    const dow = buildNowDow()
    selectQb.getMany.mockResolvedValueOnce([
      { shopId: 'S4', dayOfWeek: dow, openTime: '00:00:00', closeTime: '23:59:59' }
    ])
    const r = await job.run()
    expect(r.skipped).toBe(1)
    expect(updateQb.execute).not.toHaveBeenCalled()
  })

  it('hourRepo getMany 抛错 → 候选店铺按「无时段」处理（每店都视为应 closed）', async () => {
    shopRepo.find.mockResolvedValueOnce([
      { id: 'S5', businessStatus: 0 },
      { id: 'S6', businessStatus: 1 }
    ])
    selectQb.getMany.mockRejectedValueOnce(new Error('DB index gone'))
    const r = await job.run()
    /* S5 已是 0 → skipped；S6 是 1 → 应 closed */
    expect(r.skipped).toBe(1)
    expect(r.closed).toBe(1)
  })

  it('单店 update 抛错 → failed=1，其他继续', async () => {
    shopRepo.find.mockResolvedValueOnce([
      { id: 'S7', businessStatus: 0 },
      { id: 'S8', businessStatus: 0 }
    ])
    selectQb.getMany.mockResolvedValueOnce([
      { shopId: 'S7', dayOfWeek: 0, openTime: '00:00:00', closeTime: '23:59:59' },
      { shopId: 'S8', dayOfWeek: 0, openTime: '00:00:00', closeTime: '23:59:59' }
    ])
    updateQb.execute
      .mockRejectedValueOnce(new Error('lock timeout'))
      .mockResolvedValueOnce({ affected: 1 })
    const r = await job.run()
    expect(r.failed).toBe(1)
    expect(r.opened).toBe(1)
  })

  it('handleCron 调用 run', async () => {
    shopRepo.find.mockResolvedValueOnce([])
    await job.handleCron()
    expect(shopRepo.find).toHaveBeenCalledTimes(1)
  })
})
