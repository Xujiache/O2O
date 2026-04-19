/**
 * @file invite-relation.service.spec.ts
 * @stage P4-REVIEW-01 / I-05 R1
 * @desc V4.9 新客礼券触发验证：completeReward 同时发积分 + 调 UserCouponService.issueByEvent
 * @author 单 Agent V2.0（修复轮次 R1）
 *
 * 关键覆盖：
 *   ① completeReward 同时发积分 + 触发邀请奖券（issueByEvent('invitation_succeeded', source=3)）
 *   ② UserCouponService 抛错时积分仍发放（容错：发券失败不阻塞主流程）
 *   ③ UserCouponService 未注入（@Optional）时 completeReward 仅发积分不抛错
 *   ④ 反向用例：未绑定邀请人时 silent return（earn / issueByEvent 都不调）
 *   ⑤ reward_status != PENDING 时 silent return（幂等）
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { InviteRelation, UserPointFlow } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { InviteRelationService } from './invite-relation.service'
import { UserCouponService } from './user-coupon.service'
import { UserPointService } from './user-point.service'

interface RelationEntity {
  id: string
  inviterId: string
  inviteeId: string
  inviteCode: string
  rewardStatus: number
  rewardAt: Date | null
  rewardRemark: string | null
}

interface UpdateBuilderMock {
  set: jest.Mock
  where: jest.Mock
  execute: jest.Mock
}

describe('InviteRelationService.completeReward — I-05 R1 V4.9 新客礼券', () => {
  let service: InviteRelationService
  let relationRepo: { findOne: jest.Mock; createQueryBuilder: jest.Mock }
  let userPointService: { earn: jest.Mock }
  let userCouponService: { issueByEvent: jest.Mock } | null
  let redis: { set: jest.Mock; del: jest.Mock; get: jest.Mock }
  let updateExec: jest.Mock

  function buildUpdateBuilder(affected = 1): UpdateBuilderMock {
    updateExec = jest.fn().mockResolvedValue({ affected })
    const set = jest.fn().mockReturnThis()
    const where = jest.fn().mockReturnThis()
    const builder: UpdateBuilderMock = {
      set,
      where,
      execute: updateExec
    }
    return builder
  }

  async function buildModule(coupon: { issueByEvent: jest.Mock } | null) {
    relationRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn()
    }
    userPointService = { earn: jest.fn().mockResolvedValue(undefined) }
    userCouponService = coupon
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null)
    }

    /* createQueryBuilder() 链式：返回 update().set().where().execute() */
    const updateBuilder = buildUpdateBuilder(1)
    relationRepo.createQueryBuilder.mockReturnValue({
      update: jest.fn().mockReturnValue(updateBuilder)
    })

    const providers: Array<unknown> = [
      InviteRelationService,
      { provide: getRepositoryToken(InviteRelation), useValue: relationRepo },
      { provide: getRepositoryToken(UserPointFlow), useValue: {} },
      { provide: REDIS_CLIENT, useValue: redis },
      { provide: UserPointService, useValue: userPointService }
    ]
    if (coupon !== null) {
      providers.push({ provide: UserCouponService, useValue: coupon })
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: providers as never
    }).compile()

    service = moduleRef.get(InviteRelationService)
  }

  function buildPendingRelation(): RelationEntity {
    return {
      id: 'REL-1',
      inviterId: 'INVITER-1',
      inviteeId: 'INVITEE-1',
      inviteCode: 'INV99999',
      rewardStatus: 0 /* PENDING */,
      rewardAt: null,
      rewardRemark: null
    }
  }

  /* ====================================================================
   * 1) completeReward 同时发积分 + 发新客券（核心 I-05）
   * ==================================================================== */

  it('completeReward 同时发积分 + 发新客券（issueByEvent invitation_succeeded source=3）', async () => {
    const couponMock = {
      issueByEvent: jest.fn().mockResolvedValue({ success: true, issued: 1, skipped: 0 })
    }
    await buildModule(couponMock)
    relationRepo.findOne.mockResolvedValueOnce(buildPendingRelation())

    await service.completeReward('INVITEE-1', 'T202604190000888', 100)

    expect(userPointService.earn).toHaveBeenCalledWith(
      'INVITER-1',
      100,
      4 /* BIZ_TYPE_INVITE */,
      'T202604190000888'
    )
    expect(couponMock.issueByEvent).toHaveBeenCalledWith({
      userId: 'INVITER-1',
      eventType: 'invitation_succeeded',
      source: 3
    })
  })

  /* ====================================================================
   * 2) UserCouponService 抛错时积分仍发放（容错性）
   * ==================================================================== */

  it('UserCouponService 抛错时积分仍发放（容错，主流程不中断）', async () => {
    const couponMock = {
      issueByEvent: jest.fn().mockRejectedValue(new Error('券模板已下架'))
    }
    await buildModule(couponMock)
    relationRepo.findOne.mockResolvedValueOnce(buildPendingRelation())

    /* 不应抛错（容错） */
    await expect(service.completeReward('INVITEE-1', 'T202604190000888')).resolves.toBeUndefined()

    /* 积分必须已发放 */
    expect(userPointService.earn).toHaveBeenCalled()
    expect(couponMock.issueByEvent).toHaveBeenCalled()
  })

  /* ====================================================================
   * 3) UserCouponService 未注入（@Optional）时仅发积分
   * ==================================================================== */

  it('UserCouponService @Optional 未注入时 → 仅发积分不抛错', async () => {
    await buildModule(null)
    relationRepo.findOne.mockResolvedValueOnce(buildPendingRelation())

    await expect(service.completeReward('INVITEE-1', 'T202604190000888')).resolves.toBeUndefined()

    expect(userPointService.earn).toHaveBeenCalled()
  })

  /* ====================================================================
   * 4) 反向：未绑定邀请人 silent return
   * ==================================================================== */

  it('未绑定邀请人时 silent return，不发积分也不发券', async () => {
    const couponMock = {
      issueByEvent: jest.fn().mockResolvedValue({ success: true, issued: 0, skipped: 0 })
    }
    await buildModule(couponMock)
    relationRepo.findOne.mockResolvedValueOnce(null)

    await service.completeReward('INVITEE-NEW', 'T202604190000999')

    expect(userPointService.earn).not.toHaveBeenCalled()
    expect(couponMock.issueByEvent).not.toHaveBeenCalled()
  })

  /* ====================================================================
   * 5) reward_status != PENDING 时 silent return（幂等）
   * ==================================================================== */

  it('reward_status=GRANTED（已发放）时 silent return（幂等保护）', async () => {
    const couponMock = {
      issueByEvent: jest.fn().mockResolvedValue({ success: true, issued: 0, skipped: 0 })
    }
    await buildModule(couponMock)
    const granted = buildPendingRelation()
    granted.rewardStatus = 2 /* GRANTED */
    relationRepo.findOne.mockResolvedValueOnce(granted)

    await service.completeReward('INVITEE-1', 'T202604190000888')

    expect(userPointService.earn).not.toHaveBeenCalled()
    expect(couponMock.issueByEvent).not.toHaveBeenCalled()
  })

  /* ====================================================================
   * 6) CAS 落空（并发场景）→ silent return
   * ==================================================================== */

  it('UPDATE CAS 落空（affected=0）时 silent return，不发积分不发券', async () => {
    const couponMock = {
      issueByEvent: jest.fn().mockResolvedValue({ success: true, issued: 1, skipped: 0 })
    }
    await buildModule(couponMock)
    /* 重新挂 createQueryBuilder：affected=0 */
    const failedExec = jest.fn().mockResolvedValue({ affected: 0 })
    const failedBuilder = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: failedExec
    }
    relationRepo.createQueryBuilder.mockReturnValue({
      update: jest.fn().mockReturnValue(failedBuilder)
    })
    relationRepo.findOne.mockResolvedValueOnce(buildPendingRelation())

    await service.completeReward('INVITEE-1', 'T202604190000888')

    expect(userPointService.earn).not.toHaveBeenCalled()
    expect(couponMock.issueByEvent).not.toHaveBeenCalled()
  })
})
