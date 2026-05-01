/**
 * @file invite-relation.service.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc 邀请关系服务：bind 绑定邀请人 / completeReward 首单完成发奖 /
 *       inviteRecordList 邀请战绩 / inviterStat 邀请统计 / inviter 占位信息
 * @author 单 Agent V2.0（Agent C）
 *
 * 数据来源：MySQL `invite_relation`（uk_invitee 唯一约束保证一人仅可被邀请一次）
 *
 * 关键算法（任务 §7.4 / §7.5）：
 *   bind：
 *     1) inviteCode 格式校验（INV{userId}），反解 inviter_id
 *     2) 防自邀（inviter_id !== invitee_id = currentUser.uid）
 *     3) uk_invitee 校验（已绑定抛 BIZ_DATA_CONFLICT）
 *     4) INSERT invite_relation 行（reward_status=0）
 *
 *   completeReward（被邀请人首单完成事件触发，本期接口已落地）：
 *     1) 找 invite_relation by invitee_id（不存在 → silent return）
 *     2) reward_status != 0 → silent return（幂等）
 *     3) UPDATE reward_status = 1 with CAS（WHERE reward_status = 0）
 *     4) 调 UserPointService.earn(inviterId, point, biz_type=4, related_no=orderNo)
 *     5) UPDATE reward_status = 2（最终态）
 *     6) 失效 invite stat 缓存
 *
 * 缓存：invite stat `invite:stat:{inviterId}` TTL 60s；写后 DEL
 *
 * 已知遗留：
 *   - sys_config 体系未落地，邀请奖励积分用常量 100；后续接入 Redis/DB 配置
 *   - inviter 昵称/头像反查依赖 user 模块 byId getter（员工 B），本期返回 mask 占位
 *   - 事件订阅（OrderFinished → completeReward）由 Sprint 8 Orchestration 接入
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException, PageResult, makePageResult } from '@/common'
import { InviteRelation, UserPointFlow } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { SnowflakeId } from '@/utils'
import { SysConfigService } from '@/modules/system/sys-config.service'
import {
  DEFAULT_INVITE_REWARD_POINT,
  SYS_KEY_INVITE_REWARD_POINT
} from '@/modules/system/sys-config.keys'
import {
  BindInviterDto,
  InvitePageVo,
  InviteRecordQueryDto,
  InviteRecordVo,
  InviteStatVo
} from '../dto/invite.dto'
import { UserCouponService } from './user-coupon.service'
import { UserPointService } from './user-point.service'

/** 邀请奖励 biz_type（与 user_point_flow 对齐） */
const BIZ_TYPE_INVITE = 4
/** 邀请统计缓存 TTL */
const INVITE_STAT_CACHE_TTL_SECONDS = 60
/** 邀请统计缓存 Key 前缀 */
const INVITE_STAT_CACHE_PREFIX = 'invite:stat:'

/** 邀请关系奖励状态：未完成 / 已完成 / 已发放 */
const REWARD_STATUS_PENDING = 0
const REWARD_STATUS_COMPLETED = 1
const REWARD_STATUS_GRANTED = 2

/**
 * Stat 缓存 JSON 形态
 */
interface StatCachePayload {
  totalInvited: number
  completedCount: number
  rewardedCount: number
  totalRewardPoint: number
}

@Injectable()
export class InviteRelationService {
  private readonly logger = new Logger(InviteRelationService.name)

  constructor(
    @InjectRepository(InviteRelation)
    private readonly relationRepo: Repository<InviteRelation>,
    @InjectRepository(UserPointFlow)
    private readonly flowRepo: Repository<UserPointFlow>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly userPointService: UserPointService,
    /**
     * P4-REVIEW-01 / I-05 修复：可选注入 UserCouponService 用于触发邀请奖券（V4.9）
     *   - @Optional() 保证 module 整合次序无关；
     *   - 缺失时 completeReward 仅发积分、不发券（不阻塞主流程）。
     */
    @Optional() private readonly userCouponService?: UserCouponService,
    /**
     * P9 Sprint 3 / W3.A.1：sys_config 全量接入。
     *   - @Optional() 保证旧测试 / mock 模式不阻塞；缺失时回退默认奖励积分常量。
     */
    @Optional() private readonly sysConfigService?: SysConfigService
  ) {}

  /* ============================================================
   *                    Public API
   * ============================================================ */

  /**
   * 公开（@Public）：邀请页 inviter 占位信息
   * 参数：inviteCode
   * 返回值：InvitePageVo
   * 用途：GET /invite/:inviteCode
   *
   * 本期方案：仅校验 inviteCode 格式 + 反解 inviter_id；inviter 昵称/头像返回 mask 占位
   */
  async getInvitePage(inviteCode: string): Promise<InvitePageVo> {
    const inviterId = this.decodeInviteCode(inviteCode)
    const point = await this.resolveRewardPoint()
    return {
      inviteCode,
      inviterId,
      inviterNickname: this.maskInviterId(inviterId),
      inviterAvatar: null,
      rewardSlogan: `好友邀请你注册即赠 ${point} 积分`
    }
  }

  /**
   * 解析邀请奖励积分（sys_config marketing.invite.reward_point；缺失时回退默认 100）
   */
  private async resolveRewardPoint(): Promise<number> {
    if (!this.sysConfigService) return DEFAULT_INVITE_REWARD_POINT
    const v = await this.sysConfigService.get<number>(
      SYS_KEY_INVITE_REWARD_POINT,
      DEFAULT_INVITE_REWARD_POINT
    )
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEFAULT_INVITE_REWARD_POINT
  }

  /**
   * 用户端：绑定邀请人
   * 参数：currentUserId（即 invitee_id，从 JWT 取） / dto
   * 返回值：InviteRecordVo
   * 用途：POST /me/invitations/bind
   *
   * 校验：
   *   - inviteCode 格式（INV{userId}）
   *   - 不可自邀（inviterId !== currentUserId）
   *   - uk_invitee（已绑定 → BIZ_DATA_CONFLICT）
   */
  async bind(currentUserId: string, dto: BindInviterDto): Promise<InviteRecordVo> {
    const inviterId = this.decodeInviteCode(dto.inviteCode)
    if (inviterId === currentUserId) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '不能邀请自己')
    }

    const existing = await this.relationRepo.findOne({
      where: { inviteeId: currentUserId, isDeleted: 0 }
    })
    if (existing) {
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '您已绑定过邀请人，无法重复绑定')
    }

    const entity = this.relationRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      inviterId,
      inviteeId: currentUserId,
      inviteCode: dto.inviteCode,
      channel: dto.channel ?? null,
      rewardStatus: REWARD_STATUS_PENDING,
      rewardAt: null,
      rewardRemark: null,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    try {
      await this.relationRepo.save(entity)
    } catch (err) {
      /* 唯一冲突兜底（并发竞态时 unique 约束触发） */
      this.logger.warn(`[INVITE] bind 唯一冲突 invitee=${currentUserId}：${(err as Error).message}`)
      throw new BusinessException(BizErrorCode.BIZ_DATA_CONFLICT, '您已绑定过邀请人')
    }

    await this.invalidateStatCache(inviterId)
    this.logger.log(
      `[INVITE] bind invitee=${currentUserId} inviter=${inviterId} channel=${dto.channel ?? '-'}`
    )
    return this.toRecordVo(entity)
  }

  /**
   * 用户端：我的邀请战绩列表（按 reward_status 筛）
   * 参数：currentInviterId / query
   * 返回值：PageResult<InviteRecordVo>
   * 用途：GET /me/invitations
   */
  async listMyInvites(
    currentInviterId: string,
    query: InviteRecordQueryDto
  ): Promise<PageResult<InviteRecordVo>> {
    const qb = this.relationRepo
      .createQueryBuilder('r')
      .where('r.inviter_id = :iid AND r.is_deleted = 0', { iid: currentInviterId })
    if (query.rewardStatus !== undefined) {
      qb.andWhere('r.reward_status = :rs', { rs: query.rewardStatus })
    }
    qb.orderBy('r.created_at', 'DESC').addOrderBy('r.id', 'DESC')
    qb.skip(query.skip()).take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toRecordVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 用户端：我的邀请统计（带缓存）
   * 参数：currentInviterId
   * 返回值：InviteStatVo
   * 用途：GET /me/invitations/stat
   */
  async getMyStat(currentInviterId: string): Promise<InviteStatVo> {
    const cacheKey = `${INVITE_STAT_CACHE_PREFIX}${currentInviterId}`
    try {
      const cached = await this.redis.get(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached) as StatCachePayload
        return parsed
      }
    } catch (err) {
      this.logger.warn(
        `[INVITE] 读 stat 缓存失败 inviter=${currentInviterId} err=${(err as Error).message}`
      )
    }

    const baseQb = this.relationRepo
      .createQueryBuilder('r')
      .where('r.inviter_id = :iid AND r.is_deleted = 0', { iid: currentInviterId })
    const [totalInvited, completedCount, rewardedCount] = await Promise.all([
      baseQb.clone().getCount(),
      baseQb.clone().andWhere('r.reward_status >= :rs', { rs: REWARD_STATUS_COMPLETED }).getCount(),
      baseQb.clone().andWhere('r.reward_status = :rs', { rs: REWARD_STATUS_GRANTED }).getCount()
    ])

    /* 邀请奖励积分聚合：从 user_point_flow 反查 inviter_id + biz_type=4 + direction=1 */
    const totalRewardRow = (await this.flowRepo
      .createQueryBuilder('f')
      .select('COALESCE(SUM(f.point), 0)', 'total')
      .where('f.user_id = :uid AND f.biz_type = :bt AND f.direction = 1 AND f.is_deleted = 0', {
        uid: currentInviterId,
        bt: BIZ_TYPE_INVITE
      })
      .getRawOne()) as { total: string | number } | undefined
    const totalRewardPoint = Number(totalRewardRow?.total ?? 0)

    const vo: InviteStatVo = {
      totalInvited,
      completedCount,
      rewardedCount,
      totalRewardPoint
    }
    try {
      await this.redis.set(cacheKey, JSON.stringify(vo), 'EX', INVITE_STAT_CACHE_TTL_SECONDS)
    } catch (err) {
      this.logger.warn(
        `[INVITE] 写 stat 缓存失败 inviter=${currentInviterId} err=${(err as Error).message}`
      )
    }
    return vo
  }

  /**
   * 内部：被邀请人首单完成时触发邀请奖励
   * 参数：inviteeId / orderNo / overridePoint?（可选覆盖默认 100）
   * 返回值：void（幂等：未绑定 / 已发放时静默返回）
   * 用途：Sprint 8 Orchestration 订阅 OrderFinished 事件后调用本方法
   *
   * 流程：
   *   1) 找 invite_relation by invitee_id（不存在 → silent）
   *   2) reward_status != 0 → silent
   *   3) UPDATE CAS reward_status=1（中间态，标记"奖励发放中"）
   *   4) 调 UserPointService.earn 给 inviter 发积分
   *   5) UPDATE reward_status=2（最终态）+ 写明细到 reward_remark
   *   6) 失效 inviter stat 缓存
   */
  async completeReward(inviteeId: string, orderNo: string, overridePoint?: number): Promise<void> {
    const point = overridePoint ?? (await this.resolveRewardPoint())
    const relation = await this.relationRepo.findOne({
      where: { inviteeId, isDeleted: 0 }
    })
    if (!relation) {
      this.logger.debug(`[INVITE] completeReward 跳过：invitee=${inviteeId} 未绑定邀请人`)
      return
    }
    if (relation.rewardStatus !== REWARD_STATUS_PENDING) {
      this.logger.debug(
        `[INVITE] completeReward 跳过：invitee=${inviteeId} reward_status=${relation.rewardStatus}`
      )
      return
    }

    const updateRes = await this.relationRepo
      .createQueryBuilder()
      .update(InviteRelation)
      .set({
        rewardStatus: REWARD_STATUS_COMPLETED,
        rewardAt: new Date(),
        rewardRemark: `首单完成（订单 ${orderNo}）— 奖励发放中：${point} 积分`,
        updatedAt: new Date()
      })
      .where('id = :id AND reward_status = :rs', {
        id: relation.id,
        rs: REWARD_STATUS_PENDING
      })
      .execute()
    if (!updateRes.affected) {
      this.logger.debug(`[INVITE] completeReward CAS 落空：relation=${relation.id} 已被并发处理`)
      return
    }

    try {
      await this.userPointService.earn(relation.inviterId, point, BIZ_TYPE_INVITE, orderNo)
    } catch (err) {
      /* earn 失败：保留中间态 reward_status=1，等待补偿任务（Sprint 8） */
      this.logger.error(
        `[INVITE] earn 失败，保留中间态 relation=${relation.id} inviter=${relation.inviterId}：${(err as Error).message}`
      )
      throw err
    }

    /**
     * P4-REVIEW-01 / I-05 修复（V4.9）：邀请人完成首单时同步触发新客礼券
     *   - 走 UserCouponService.issueByEvent('invitation_succeeded', source=3 邀请奖)；
     *   - sys_config 未落地时该 service 内部 mock 模式仅打 warn 不抛错（issued=0）；
     *   - 发券失败 try/catch 容错，不阻塞积分奖励主流程（积分已发）。
     */
    if (this.userCouponService) {
      try {
        const result = await this.userCouponService.issueByEvent({
          userId: relation.inviterId,
          eventType: 'invitation_succeeded',
          source: 3 /* user_coupon.received_source: 3 邀请奖 */
        })
        if (result.issued > 0) {
          this.logger.log(
            `[INVITE-COUPON] inviter=${relation.inviterId} 触发邀请奖券：` +
              `issued=${result.issued} skipped=${result.skipped}`
          )
        }
      } catch (err) {
        /* 发券失败不阻塞积分奖励，仅 warn */
        this.logger.warn(
          `[INVITE-COUPON] 发券失败 inviter=${relation.inviterId}：${(err as Error).message}`
        )
      }
    }

    await this.relationRepo
      .createQueryBuilder()
      .update(InviteRelation)
      .set({
        rewardStatus: REWARD_STATUS_GRANTED,
        rewardRemark: `首单完成奖励 ${point} 积分（订单 ${orderNo}）`,
        updatedAt: new Date()
      })
      .where('id = :id', { id: relation.id })
      .execute()

    await this.invalidateStatCache(relation.inviterId)
    this.logger.log(
      `[INVITE] completeReward inviter=${relation.inviterId} invitee=${inviteeId} order=${orderNo} reward=${point}`
    )
  }

  /* ============================================================
   *                    Internal helpers
   * ============================================================ */

  /**
   * 解码 inviteCode → inviterId
   * 参数：inviteCode（格式 INV{userId}，userId 为 1~30 位数字）
   * 返回值：inviter_id 字符串
   * 错误：格式不符 → PARAM_INVALID
   */
  private decodeInviteCode(inviteCode: string): string {
    const match = /^INV(\d{1,30})$/.exec(inviteCode)
    if (!match) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'inviteCode 格式错误（应为 INV{userId}）'
      )
    }
    return match[1] as string
  }

  /**
   * 邀请人 ID 脱敏（占位昵称）
   * 参数：inviterId 雪花字符串
   * 返回值：例如 "用户***6789"（取末 4 位）
   */
  private maskInviterId(inviterId: string): string {
    if (inviterId.length <= 4) return `用户***${inviterId}`
    return `用户***${inviterId.slice(-4)}`
  }

  /**
   * 失效 inviter stat 缓存
   */
  private async invalidateStatCache(inviterId: string): Promise<void> {
    try {
      await this.redis.del(`${INVITE_STAT_CACHE_PREFIX}${inviterId}`)
    } catch (err) {
      this.logger.warn(
        `[INVITE] DEL ${INVITE_STAT_CACHE_PREFIX}${inviterId} 失败：${(err as Error).message}`
      )
    }
  }

  /**
   * Entity → VO
   */
  private toRecordVo(e: InviteRelation): InviteRecordVo {
    return {
      id: e.id,
      inviterId: e.inviterId,
      inviteeId: e.inviteeId,
      inviteCode: e.inviteCode,
      channel: e.channel,
      rewardStatus: e.rewardStatus,
      rewardAt: e.rewardAt,
      rewardRemark: e.rewardRemark,
      createdAt: e.createdAt
    }
  }
}
