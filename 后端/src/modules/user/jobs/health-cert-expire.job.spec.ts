/**
 * @file health-cert-expire.job.spec.ts
 * @stage P9 Sprint 2 / W2.B.3（P9-P1-12）
 * @desc HealthCertExpireJob 单测
 * @author 单 Agent V2.0（Sprint 2 Agent B）
 *
 * 关键覆盖：
 *   1) run() 命中 0 条：仅 log，不调 send
 *   2) run() 命中 N 条全部正常 rider：N 次 send
 *   3) run() 命中 N 条，其中 1 个 rider 不存在（已封禁/软删）：跳过
 *   4) run() 命中 N 条，其中 1 个 send 抛错：failed=1，其他正常
 *   5) run() qualRepo.find 抛错：return scanned=0
 *   6) run() riderRepo.find 抛错：return notified=0
 *   7) handleCron 调 run（覆盖 cron 入口）
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Rider, RiderQualification } from '@/entities'
import { MessageService } from '@/modules/message/message.service'
import { HealthCertExpireJob } from './health-cert-expire.job'

interface RepoMock {
  find: jest.Mock
}

interface MessageServiceMock {
  send: jest.Mock
}

describe('HealthCertExpireJob', () => {
  let job: HealthCertExpireJob
  let qualRepo: RepoMock
  let riderRepo: RepoMock
  let messageService: MessageServiceMock

  const mkRider = (id: string, status = 1): Rider => ({ id, status, isDeleted: 0 }) as Rider

  const mkQual = (
    riderId: string,
    daysFromNow: number,
    overrides: Partial<RiderQualification> = {}
  ): RiderQualification => {
    const validTo = new Date(Date.now() + daysFromNow * 24 * 3600 * 1000)
    return {
      id: `Q-${riderId}-${daysFromNow}`,
      riderId,
      qualType: 2,
      validTo,
      auditStatus: 1,
      isDeleted: 0,
      ...overrides
    } as RiderQualification
  }

  beforeEach(async () => {
    qualRepo = { find: jest.fn() }
    riderRepo = { find: jest.fn() }
    messageService = { send: jest.fn().mockResolvedValue({ jobsCreated: 1 }) }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        HealthCertExpireJob,
        { provide: getRepositoryToken(RiderQualification), useValue: qualRepo },
        { provide: getRepositoryToken(Rider), useValue: riderRepo },
        { provide: MessageService, useValue: messageService }
      ]
    }).compile()

    job = moduleRef.get(HealthCertExpireJob)
  })

  it('命中 0 条 → 不调 send', async () => {
    qualRepo.find.mockResolvedValueOnce([])
    const r = await job.run()
    expect(r).toEqual({ scanned: 0, notified: 0, failed: 0 })
    expect(riderRepo.find).not.toHaveBeenCalled()
    expect(messageService.send).not.toHaveBeenCalled()
  })

  it('命中 5 条 → 5 个正常 rider → notified=5 / failed=0', async () => {
    const quals = [
      mkQual('R1', 3),
      mkQual('R2', 7),
      mkQual('R3', 10),
      mkQual('R4', 13),
      mkQual('R5', 14)
    ]
    qualRepo.find.mockResolvedValueOnce(quals)
    riderRepo.find.mockResolvedValueOnce([
      mkRider('R1'),
      mkRider('R2'),
      mkRider('R3'),
      mkRider('R4'),
      mkRider('R5')
    ])

    const r = await job.run()
    expect(r).toEqual({ scanned: 5, notified: 5, failed: 0 })
    expect(messageService.send).toHaveBeenCalledTimes(5)
    /* 抽查参数 */
    const firstCall = messageService.send.mock.calls[0][0]
    expect(firstCall.code).toBe('SYSTEM_NOTICE')
    expect(firstCall.targetType).toBe(3)
    expect(firstCall.targetId).toBe('R1')
    expect(typeof firstCall.vars.content).toBe('string')
    expect(firstCall.vars.content).toContain('健康证')
  })

  it('命中 3 条，其中 1 个 rider 已离职 → 跳过', async () => {
    qualRepo.find.mockResolvedValueOnce([mkQual('R1', 5), mkQual('R2', 6), mkQual('R3', 7)])
    /* R2 主表查询返回不存在（已封禁 / 软删） */
    riderRepo.find.mockResolvedValueOnce([mkRider('R1'), mkRider('R3')])

    const r = await job.run()
    expect(r).toEqual({ scanned: 3, notified: 2, failed: 0 })
    expect(messageService.send).toHaveBeenCalledTimes(2)
    const calledIds = messageService.send.mock.calls.map((c) => c[0].targetId)
    expect(calledIds).toEqual(['R1', 'R3'])
  })

  it('命中 3 条，其中 1 个 send 抛错 → failed=1，其他成功', async () => {
    qualRepo.find.mockResolvedValueOnce([mkQual('R1', 5), mkQual('R2', 6), mkQual('R3', 7)])
    riderRepo.find.mockResolvedValueOnce([mkRider('R1'), mkRider('R2'), mkRider('R3')])
    messageService.send
      .mockResolvedValueOnce({ jobsCreated: 1 })
      .mockRejectedValueOnce(new Error('mq down'))
      .mockResolvedValueOnce({ jobsCreated: 1 })

    const r = await job.run()
    expect(r).toEqual({ scanned: 3, notified: 2, failed: 1 })
  })

  it('qualRepo.find 抛错 → 返回 0/0/0', async () => {
    qualRepo.find.mockRejectedValueOnce(new Error('DB down'))
    const r = await job.run()
    expect(r).toEqual({ scanned: 0, notified: 0, failed: 0 })
    expect(messageService.send).not.toHaveBeenCalled()
  })

  it('riderRepo.find 抛错 → 返回 scanned=N notified=0', async () => {
    qualRepo.find.mockResolvedValueOnce([mkQual('R1', 3)])
    riderRepo.find.mockRejectedValueOnce(new Error('DB conn lost'))
    const r = await job.run()
    expect(r).toEqual({ scanned: 1, notified: 0, failed: 0 })
    expect(messageService.send).not.toHaveBeenCalled()
  })

  it('handleCron 调用 run', async () => {
    qualRepo.find.mockResolvedValueOnce([])
    await job.handleCron()
    expect(qualRepo.find).toHaveBeenCalledTimes(1)
  })

  it('validTo=null 的资质 → daysLeft 安全回退到 0', async () => {
    const q = mkQual('R1', 3)
    /* 强制 validTo=null（极端边界场景，DB 字段允许 null） */
    q.validTo = null
    qualRepo.find.mockResolvedValueOnce([q])
    riderRepo.find.mockResolvedValueOnce([mkRider('R1')])
    const r = await job.run()
    expect(r.notified).toBe(1)
    const sentArgs = messageService.send.mock.calls[0][0]
    expect(sentArgs.vars.content).toContain('未知')
  })
})
