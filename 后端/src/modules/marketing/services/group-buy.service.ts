/**
 * @file group-buy.service.ts
 * @stage P4/T4.11（Sprint 2）
 * @desc 拼单服务（promo_type=3）：joinGroup / closeGroup / autoExpire / listMyGroupBuys
 * @author 单 Agent V2.0
 *
 * Redis 数据结构：
 *   1. Set  `groupbuy:{promotionId}:{groupNo}`         成员集（userId 列表）
 *   2. Hash `groupbuy:meta:{promotionId}:{groupNo}`    团元信息
 *        - status        pending / success / failed
 *        - groupSize     成团人数
 *        - createdAt     ISO 时间
 *        - expireAt      ISO 时间（可空）
 *        - discountPerHead  每人减
 *   3. Set  `groupbuy:user:{userId}`                    用户参团索引（"promotionId:groupNo"）
 *
 * TTL：Set/Hash 同步 EXPIRE timeoutMinutes*60s；成团 / 强制关闭后续延长 TTL 24h（保留可查）
 *
 * 注意：本服务**不触发**真实订单合并，仅维护拼单状态机；订单合并由 Sprint 3 Order 模块订阅事件
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type Redis from 'ioredis'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { Promotion } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { generateBizNo } from '@/utils'
import { type GroupBuyStatus, type GroupBuyVo, type QueryMyGroupBuyDto } from '../dto/group-buy.dto'
import { type GroupBuyRule } from '../dto/promotion.dto'
import { PromotionRuleValidatorService } from './promotion-rule-validator.service'

/* ============================================================================
 * Redis Key 工厂
 * ============================================================================ */
const GROUP_KEY = (promotionId: string, groupNo: string): string =>
  `groupbuy:${promotionId}:${groupNo}`
const GROUP_META_KEY = (promotionId: string, groupNo: string): string =>
  `groupbuy:meta:${promotionId}:${groupNo}`
const USER_INDEX_KEY = (userId: string): string => `groupbuy:user:${userId}`

/** 成团 / 关闭后保留 TTL（秒）：24h，便于用户后续查询历史 */
const COMPLETED_TTL_SECONDS = 86400

/** 用户参团索引 TTL（秒）：7 天（避免 Set 无限膨胀） */
const USER_INDEX_TTL_SECONDS = 7 * 86400

@Injectable()
export class GroupBuyService {
  private readonly logger = new Logger(GroupBuyService.name)

  constructor(
    @InjectRepository(Promotion) private readonly promotionRepo: Repository<Promotion>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly ruleValidator: PromotionRuleValidatorService
  ) {}

  /**
   * 加入拼单
   * 参数：promotionId / userId / groupNo（可选；不传则开新团）
   * 返回值：GroupBuyVo（含当前状态 / 成员数 / 过期时间）
   * 用途：POST /promotions/:id/join-group
   *
   * 算法（V4.10 验收）：
   *   1. 校验活动存在 + promo_type=3 + status=1 + valid 时段内
   *   2. 解析 GroupBuyRule（groupSize / discountPerHead / timeoutMinutes）
   *   3. 若不传 groupNo → generateBizNo('G',...) 开新团
   *   4. SADD 用户到 Set；SCARD 取人数
   *   5. 若 SCARD == groupSize → HSET status=success；TTL 延长到 24h
   *   6. 否则 EXPIRE 设置超时（首次加入团时设置）
   *   7. 同步写用户索引 SADD groupbuy:user:{userId}
   */
  async joinGroup(
    promotionId: string,
    userId: string,
    groupNo: string | undefined
  ): Promise<GroupBuyVo> {
    const promotion = await this.assertGroupBuyPromotion(promotionId)
    const rule = this.ruleValidator.parseGroupBuy(promotion.ruleJson)

    const targetGroupNo = groupNo ?? this.generateGroupNo()
    const groupKey = GROUP_KEY(promotionId, targetGroupNo)
    const metaKey = GROUP_META_KEY(promotionId, targetGroupNo)

    /* 加入既有团时，校验团是否仍在 pending 状态 */
    if (groupNo !== undefined) {
      const status = await this.safeHGet(metaKey, 'status')
      if (status === 'success') {
        throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '本团已成团，无法再加入')
      }
      if (status === null || status === 'failed') {
        throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '本团不存在或已超时')
      }
    }

    const expireAt = new Date(Date.now() + rule.timeoutMinutes * 60_000)

    /* 写 Set + Hash + 用户索引 */
    await this.safeSAdd(groupKey, userId)
    if (groupNo === undefined) {
      /* 开新团：HSET 初始 meta + EXPIRE 设超时 */
      await this.safeHSet(metaKey, {
        status: 'pending',
        groupSize: String(rule.groupSize),
        promotionId,
        groupNo: targetGroupNo,
        discountPerHead: rule.discountPerHead,
        createdAt: new Date().toISOString(),
        expireAt: expireAt.toISOString()
      })
      await this.safeExpire(groupKey, rule.timeoutMinutes * 60)
      await this.safeExpire(metaKey, rule.timeoutMinutes * 60)
    }

    const currentSize = await this.safeSCard(groupKey)

    /* 检查是否成团；成团时延长 TTL 到 24h */
    let status: GroupBuyStatus = 'pending'
    if (currentSize >= rule.groupSize) {
      await this.safeHSet(metaKey, { status: 'success' })
      await this.safeExpire(groupKey, COMPLETED_TTL_SECONDS)
      await this.safeExpire(metaKey, COMPLETED_TTL_SECONDS)
      status = 'success'
      this.logger.log(
        `拼单成团：promo=${promotionId} group=${targetGroupNo} size=${currentSize}/${rule.groupSize}`
      )
    }

    /* 写用户索引（含 TTL） */
    const userIndexKey = USER_INDEX_KEY(userId)
    await this.safeSAdd(userIndexKey, `${promotionId}:${targetGroupNo}`)
    await this.safeExpire(userIndexKey, USER_INDEX_TTL_SECONDS)

    const participants = await this.safeSMembers(groupKey)
    return {
      promotionId,
      groupNo: targetGroupNo,
      currentSize,
      groupSize: rule.groupSize,
      status,
      discountPerHead: rule.discountPerHead,
      participants,
      expireAt
    }
  }

  /**
   * 我的拼单列表
   * 参数：userId / query
   * 返回值：GroupBuyVo[]
   * 用途：GET /me/group-buys
   *
   * 实现：迭代用户索引 Set，针对每条 promotionId:groupNo 查 meta 还原状态；
   *      meta 缺失视为 failed（超时被 Redis TTL 回收）
   */
  async listMyGroupBuys(userId: string, query: QueryMyGroupBuyDto): Promise<GroupBuyVo[]> {
    const userIndexKey = USER_INDEX_KEY(userId)
    const limit = Math.min(query.limit ?? 50, 200)
    const items = await this.safeSMembers(userIndexKey)
    const results: GroupBuyVo[] = []
    /* 索引顺序由 Redis 决定，本期不强求时间排序；后续 Sprint 可改 ZSET */
    for (const item of items.slice(0, limit)) {
      const [promotionId, groupNo] = item.split(':')
      if (!promotionId || !groupNo) continue
      const vo = await this.snapshot(promotionId, groupNo, userId)
      if (!vo) continue
      if (query.status === undefined || vo.status === query.status) {
        results.push(vo)
      }
    }
    return results
  }

  /**
   * 抓取一条拼单的当前快照
   * 参数：promotionId / groupNo / 可选 currentUserId 用于权限校验
   * 返回值：GroupBuyVo 或 null（meta 不存在）
   * 用途：listMyGroupBuys 内部调用；亦可被 join 调用前预检
   */
  async snapshot(
    promotionId: string,
    groupNo: string,
    _currentUserId?: string
  ): Promise<GroupBuyVo | null> {
    const groupKey = GROUP_KEY(promotionId, groupNo)
    const metaKey = GROUP_META_KEY(promotionId, groupNo)
    const meta = await this.safeHGetAll(metaKey)
    if (Object.keys(meta).length === 0) {
      /* meta 已过期 / 不存在 → 视为 failed（仍返回最小信息以便 UI 展示） */
      return {
        promotionId,
        groupNo,
        currentSize: 0,
        groupSize: 0,
        status: 'failed',
        discountPerHead: '0.00',
        participants: [],
        expireAt: null
      }
    }
    const currentSize = await this.safeSCard(groupKey)
    const groupSize = parseInt(meta.groupSize ?? '0', 10) || 0
    const status: GroupBuyStatus = this.normalizeStatus(meta.status)
    const participants = await this.safeSMembers(groupKey)
    const expireAt = meta.expireAt ? new Date(meta.expireAt) : null
    return {
      promotionId,
      groupNo,
      currentSize,
      groupSize,
      status,
      discountPerHead: meta.discountPerHead ?? '0.00',
      participants,
      expireAt
    }
  }

  /**
   * 强制关闭一个团（管理 / 商户兜底）
   * 参数：promotionId / groupNo
   * 返回值：GroupBuyVo
   * 用途：admin 端兜底关闭异常团；本期 controller 未直接暴露，留给后续接入
   */
  async closeGroup(promotionId: string, groupNo: string): Promise<GroupBuyVo> {
    const metaKey = GROUP_META_KEY(promotionId, groupNo)
    await this.safeHSet(metaKey, { status: 'failed', closedAt: new Date().toISOString() })
    await this.safeExpire(metaKey, COMPLETED_TTL_SECONDS)
    await this.safeExpire(GROUP_KEY(promotionId, groupNo), COMPLETED_TTL_SECONDS)
    this.logger.log(`拼单强制关闭：promo=${promotionId} group=${groupNo}`)
    const snap = await this.snapshot(promotionId, groupNo)
    return (
      snap ?? {
        promotionId,
        groupNo,
        currentSize: 0,
        groupSize: 0,
        status: 'failed',
        discountPerHead: '0.00',
        participants: [],
        expireAt: null
      }
    )
  }

  /**
   * 主动检查并标记超时团（被 join 前置 / 调度任务调用）
   * 参数：promotionId / groupNo
   * 返回值：标记后的状态（pending → failed 或不变）
   * 用途：兜底 —— 当 Set 还在但 expireAt 已过时，主动写 failed
   */
  async autoExpire(promotionId: string, groupNo: string): Promise<GroupBuyStatus> {
    const meta = await this.safeHGetAll(GROUP_META_KEY(promotionId, groupNo))
    if (Object.keys(meta).length === 0) return 'failed'
    if (meta.status === 'success' || meta.status === 'failed') {
      return this.normalizeStatus(meta.status)
    }
    if (meta.expireAt && new Date(meta.expireAt).getTime() < Date.now()) {
      await this.closeGroup(promotionId, groupNo)
      return 'failed'
    }
    return 'pending'
  }

  /* ==========================================================================
   * 私有：业务校验 / Redis 容错包装
   * ========================================================================== */

  /**
   * 校验活动是否为可加入拼单的活动
   * 抛错码：BIZ_RESOURCE_NOT_FOUND / BIZ_STATE_INVALID
   */
  private async assertGroupBuyPromotion(promotionId: string): Promise<Promotion> {
    const promotion = await this.promotionRepo.findOne({
      where: { id: promotionId, isDeleted: 0 }
    })
    if (!promotion) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '活动不存在')
    }
    if (promotion.promoType !== 3) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '该活动不是拼单类型')
    }
    if (promotion.status !== 1) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '活动未启用')
    }
    const now = Date.now()
    if (promotion.validFrom.getTime() > now || promotion.validTo.getTime() < now) {
      throw new BusinessException(BizErrorCode.BIZ_STATE_INVALID, '活动不在有效期内')
    }
    return promotion
  }

  /** 生成团号：G + yyyymmdd + 6 位序号 = 15 位 */
  private generateGroupNo(): string {
    return generateBizNo('G')
  }

  private normalizeStatus(raw: string | undefined): GroupBuyStatus {
    if (raw === 'success' || raw === 'failed') return raw
    return 'pending'
  }

  /* ----- ioredis 操作的容错包装 ----- */

  private async safeSAdd(key: string, member: string): Promise<void> {
    try {
      await this.redis.sadd(key, member)
    } catch (err) {
      this.logger.warn(`Redis SADD ${key} 失败：${(err as Error).message}`)
    }
  }

  private async safeSCard(key: string): Promise<number> {
    try {
      return await this.redis.scard(key)
    } catch (err) {
      this.logger.warn(`Redis SCARD ${key} 失败：${(err as Error).message}`)
      return 0
    }
  }

  private async safeSMembers(key: string): Promise<string[]> {
    try {
      return await this.redis.smembers(key)
    } catch (err) {
      this.logger.warn(`Redis SMEMBERS ${key} 失败：${(err as Error).message}`)
      return []
    }
  }

  private async safeHSet(key: string, fields: Record<string, string>): Promise<void> {
    try {
      const args: string[] = []
      for (const [k, v] of Object.entries(fields)) {
        args.push(k, v)
      }
      if (args.length > 0) {
        /* ioredis 的 hset 接受 (key, ...fieldValuePairs) 形式 */
        await this.redis.hset(key, ...args)
      }
    } catch (err) {
      this.logger.warn(`Redis HSET ${key} 失败：${(err as Error).message}`)
    }
  }

  private async safeHGet(key: string, field: string): Promise<string | null> {
    try {
      return await this.redis.hget(key, field)
    } catch (err) {
      this.logger.warn(`Redis HGET ${key} 失败：${(err as Error).message}`)
      return null
    }
  }

  private async safeHGetAll(key: string): Promise<Record<string, string>> {
    try {
      return await this.redis.hgetall(key)
    } catch (err) {
      this.logger.warn(`Redis HGETALL ${key} 失败：${(err as Error).message}`)
      return {}
    }
  }

  private async safeExpire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.expire(key, ttlSeconds)
    } catch (err) {
      this.logger.warn(`Redis EXPIRE ${key} 失败：${(err as Error).message}`)
    }
  }
}
