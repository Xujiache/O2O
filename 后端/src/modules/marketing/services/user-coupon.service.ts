/**
 * @file user-coupon.service.ts
 * @stage P4/T4.10（Sprint 2）
 * @desc 用户券服务：领取 / 触发式发放 / 列表 / 最优券推荐 / 冻结-核销-恢复 / 过期清理
 * @author 单 Agent V2.0
 *
 * 数据：MySQL `user_coupon` + `coupon`
 * 缓存：
 *   - 用户券列表：coupon:user:{userId} TTL 60s（写操作 receive/freeze/use/restore 后 DEL）
 *   - 模板详情：复用 CouponService 内 coupon:tpl:{couponId} TTL 300s
 *
 * 关键业务规则（对齐用户给定 §7）：
 *   - 7.1 per_user_limit：领券前 COUNT(*) FROM user_coupon WHERE user_id=? AND coupon_id=? AND status IN (1,2,3)
 *   - 7.2 总量管控：事务内 SELECT FOR UPDATE coupon → check total_qty - received_qty → INSERT user_coupon → UPDATE coupon.received_qty++（原子）
 *   - 7.3 valid_from / valid_to 计算：valid_type=1 沿用模板时段；valid_type=2 = NOW + valid_days
 *   - 7.4 freeze/use/restore：1↔3↔2 三态闭环
 *   - 7.5 best-match：scene + applicable_shops + minOrderAmount 过滤后，BigNumber 算单张抵扣最大
 *   - 7.6 issueByEvent：从 sys_config（mock 模式缺配置打日志返回成功）
 *
 * 限流：领券 1 次 / 3 秒 / (userId, couponId)，Redis SET NX EX
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import type Redis from 'ioredis'
import { DataSource, EntityManager, In, Repository } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { Coupon, UserCoupon } from '@/entities'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { MessageService } from '@/modules/message/message.service'
import { SnowflakeId } from '@/utils'
import {
  type BestMatchQueryDto,
  type BestMatchUserCouponVo,
  type IssueResultVo,
  type QueryUserCouponDto,
  type UserCouponVo,
  type IssueEventType
} from '../dto/user-coupon.dto'
import { CouponService } from './coupon.service'

/* ============================================================================
 * Redis 缓存 / 限流键
 * ============================================================================ */
const USER_COUPON_LIST_KEY = (userId: string): string => `coupon:user:${userId}`
const USER_COUPON_LIST_TTL_SECONDS = 60

/** receive 限流：3s/次/(userId, couponId)，防止用户连击刷领 */
const RECEIVE_RATELIMIT_KEY = (userId: string, couponId: string): string =>
  `coupon:rl:receive:${userId}:${couponId}`
const RECEIVE_RATELIMIT_TTL_SECONDS = 3

/** 用户券"占用中"状态集合（占名额、不可重复领） */
const OCCUPIED_STATUSES = [1, 2, 3] as const

/** 单张券折扣计算结果（内部用） */
interface DiscountCandidate {
  uc: UserCoupon
  coupon: Coupon
  discount: BigNumber
}

@Injectable()
export class UserCouponService {
  private readonly logger = new Logger(UserCouponService.name)

  constructor(
    @InjectRepository(UserCoupon) private readonly userCouponRepo: Repository<UserCoupon>,
    @InjectRepository(Coupon) private readonly couponRepo: Repository<Coupon>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly couponService: CouponService,
    private readonly operationLogService: OperationLogService,
    /* MessageService 可选注入：marketing.module 后续整合时若未导入 MessageModule 不影响构造 */
    @Optional() private readonly messageService?: MessageService
  ) {}

  /* ==========================================================================
   * 一、receive 主动领取
   * ========================================================================== */

  /**
   * 用户主动领取一张优惠券（receivedSource=1）
   * 参数：userId / couponId
   * 返回值：UserCouponVo
   * 用途：POST /coupons/:id/receive
   *
   * 流程：
   *   1) Redis SETNX 限流 3s/次/(userId, couponId)
   *   2) dataSource.transaction：
   *      - SELECT FOR UPDATE coupon WHERE id=? AND is_deleted=0
   *      - 校验 status=1 + valid 时段（valid_type=1）
   *      - 校验总量：total_qty=0 OR received_qty < total_qty
   *      - 校验 per_user_limit：COUNT user_coupon WHERE user_id=? AND coupon_id=? AND status IN (1,2,3) < per_user_limit
   *      - 计算 valid_from / valid_to
   *      - INSERT user_coupon
   *      - UPDATE coupon SET received_qty = received_qty + 1
   *   3) DEL 用户列表缓存 + 模板缓存
   *   4) 异步发送 USER_COUPON 站内信（best-effort）
   */
  async receive(userId: string, couponId: string): Promise<UserCouponVo> {
    await this.assertReceiveRateLimit(userId, couponId)

    const { uc, coupon } = await this.dataSource.transaction(async (manager) => {
      const c = await manager
        .createQueryBuilder(Coupon, 'c')
        .setLock('pessimistic_write')
        .where('c.id = :id AND c.is_deleted = 0', { id: couponId })
        .getOne()
      if (!c) {
        throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '优惠券不存在')
      }
      this.assertReceivable(c)

      /* per_user_limit 校验（V4.7 验收点） */
      const occupied = await manager.count(UserCoupon, {
        where: {
          userId,
          couponId,
          status: In(OCCUPIED_STATUSES as unknown as number[]),
          isDeleted: 0
        }
      })
      if (occupied >= c.perUserLimit) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '已达每人限领上限')
      }

      /* 总量管控：在 FOR UPDATE 行锁下做 check + UPDATE，原子安全 */
      if (c.totalQty > 0 && c.receivedQty >= c.totalQty) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '该券已领完')
      }

      const { validFrom, validTo } = this.computeUserCouponValidity(c)
      const now = new Date()
      const userCoupon = manager.create(UserCoupon, {
        id: SnowflakeId.next(),
        tenantId: 1,
        userId,
        couponId: c.id,
        couponCode: c.couponCode,
        validFrom,
        validTo,
        status: 1,
        usedAt: null,
        usedOrderNo: null,
        usedOrderType: null,
        discountAmount: null,
        receivedSource: 1,
        isDeleted: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })
      await manager.save(userCoupon)

      c.receivedQty = c.receivedQty + 1
      c.updatedAt = now
      await manager.save(c)

      return { uc: userCoupon, coupon: c }
    })

    await this.invalidateUserListCache(userId)
    await this.couponService.invalidateTplCache(couponId)
    this.logger.log(
      `用户 ${userId} 领取券 ${couponId}（${coupon.couponCode}），user_coupon=${uc.id}`
    )
    void this.notifyCouponReceived(userId, coupon, uc.validTo)

    return this.buildVo(uc, coupon)
  }

  /* ==========================================================================
   * 二、issueByEvent 触发式发放（被未来事件订阅）
   * ========================================================================== */

  /**
   * 触发式批量发券（被 Sprint 8 Orchestration Saga 在事件到达时调用）
   *
   * 流程：
   *   1) 读取 sys_config(key=`marketing.event_coupon.{eventType}`) JSON 数组 [{couponId, qty}]
   *   2) 缺配置：mock 模式返回 success=true / issued=0，仅打 warn 日志（不抛异常）
   *   3) 命中：对每条配置循环调 issueOne（事务内 SELECT FOR UPDATE）
   *   4) 单条失败（如券已下架/总量耗尽）只 warn 不阻断；汇总 issued/skipped
   *
   * 当前未接入 sys_config，本期固定走 mock 分支返回 success：
   *   - 待 Sprint 8 SysConfig 落地后只需把 fetchEventConfig 实现切到真实读库
   *
   * 参数：input { userId, eventType, source }
   * 返回值：{ success, issued, skipped }
   */
  async issueByEvent(input: {
    userId: string
    eventType: IssueEventType
    source: number
  }): Promise<{ success: boolean; issued: number; skipped: number }> {
    const config = await this.fetchEventConfig(input.eventType)
    if (config.length === 0) {
      this.logger.warn(
        `[issueByEvent] mock 模式：event=${input.eventType} 无配置，跳过；user=${input.userId}`
      )
      return { success: true, issued: 0, skipped: 0 }
    }

    let issued = 0
    let skipped = 0
    for (const { couponId, qty } of config) {
      for (let i = 0; i < qty; i++) {
        try {
          await this.issueOne(input.userId, couponId, input.source)
          issued += 1
        } catch (err) {
          skipped += 1
          this.logger.warn(
            `[issueByEvent] event=${input.eventType} user=${input.userId} coupon=${couponId} 跳过：${(err as Error).message}`
          )
        }
      }
    }
    if (issued > 0) {
      await this.invalidateUserListCache(input.userId)
    }
    return { success: true, issued, skipped }
  }

  /* ==========================================================================
   * 三、adminIssue 管理后台批量发放
   * ========================================================================== */

  /**
   * 管理后台批量发放优惠券给指定用户列表
   * 参数：couponId / userIds / source（2 活动赠 / 3 邀请奖 / 4 客服补偿） / opAdminId
   * 返回值：IssueResultVo（含 issued / requested / remaining / skippedUserIds）
   * 用途：POST /admin/coupons/:id/issue
   *
   * 并发安全：在事务内 SELECT FOR UPDATE coupon 获取行锁 → 校验余量与每人限领 → 批量
   *           INSERT user_coupon → UPDATE coupon.received_qty += 实际发放数。
   *           per_user_limit 已达的用户被跳过并加入 skippedUserIds；总量耗尽则截断后续用户。
   */
  async adminIssue(
    couponId: string,
    userIds: string[],
    source: number,
    opAdminId: string
  ): Promise<IssueResultVo> {
    if (![2, 3, 4].includes(source)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'source 必须为 2 / 3 / 4（活动赠 / 邀请奖 / 客服补偿）'
      )
    }
    if (!userIds || userIds.length === 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'userIds 不能为空')
    }
    /* 去重，避免一份 dto 内同一 userId 占多个名额 */
    const uniqueUserIds = Array.from(new Set(userIds))

    const result = await this.dataSource.transaction(async (manager) => {
      const c = await manager
        .createQueryBuilder(Coupon, 'c')
        .setLock('pessimistic_write')
        .where('c.id = :id AND c.is_deleted = 0', { id: couponId })
        .getOne()
      if (!c) {
        throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '优惠券不存在')
      }
      this.assertReceivable(c, /* allowFutureValidFrom */ true)

      /* 预查每个 userId 的占用数（避免 N 次 COUNT；一次 GROUP BY） */
      const occMap = await this.countOccupiedBatch(manager, couponId, uniqueUserIds)

      const skipped: string[] = []
      const toInsert: UserCoupon[] = []
      let remainingSlots: number =
        c.totalQty === 0 ? Number.MAX_SAFE_INTEGER : c.totalQty - c.receivedQty

      const now = new Date()
      const { validFrom, validTo } = this.computeUserCouponValidity(c)

      for (const uid of uniqueUserIds) {
        if (remainingSlots <= 0) {
          skipped.push(uid)
          continue
        }
        const occupied = occMap.get(uid) ?? 0
        if (occupied >= c.perUserLimit) {
          skipped.push(uid)
          continue
        }
        toInsert.push(
          manager.create(UserCoupon, {
            id: SnowflakeId.next(),
            tenantId: 1,
            userId: uid,
            couponId: c.id,
            couponCode: c.couponCode,
            validFrom,
            validTo,
            status: 1,
            usedAt: null,
            usedOrderNo: null,
            usedOrderType: null,
            discountAmount: null,
            receivedSource: source,
            isDeleted: 0,
            createdAt: now,
            updatedAt: now,
            deletedAt: null
          })
        )
        remainingSlots -= 1
      }

      if (toInsert.length > 0) {
        await manager.save(UserCoupon, toInsert)
        c.receivedQty = c.receivedQty + toInsert.length
        c.updatedAt = now
        await manager.save(c)
      }

      return {
        coupon: c,
        issued: toInsert.length,
        requested: uniqueUserIds.length,
        skippedUserIds: skipped,
        remaining: c.totalQty === 0 ? -1 : c.totalQty - c.receivedQty
      }
    })

    /* 缓存失效：被发放用户列表 + 模板详情 */
    await Promise.all(uniqueUserIds.map((uid) => this.invalidateUserListCache(uid)))
    await this.couponService.invalidateTplCache(couponId)

    await this.operationLogService.write({
      opAdminId,
      module: 'marketing',
      action: 'issue',
      resourceType: 'coupon',
      resourceId: couponId,
      description: `批量发放券 ${result.coupon.couponCode}：实发 ${result.issued} / 请求 ${result.requested}（source=${source}）`,
      extra: {
        userIds: uniqueUserIds,
        source,
        skippedUserIds: result.skippedUserIds
      }
    })

    return {
      issued: result.issued,
      requested: result.requested,
      remaining: result.remaining,
      skippedUserIds: result.skippedUserIds
    }
  }

  /* ==========================================================================
   * 四、list 我的券列表
   * ========================================================================== */

  /**
   * 用户端"我的券"列表（按 status 筛选；ORDER BY status ASC, valid_to ASC）
   * 参数：userId / query
   * 返回值：PageResult<UserCouponVo>
   * 用途：GET /me/coupons
   *
   * 缓存：
   *   - 默认查询（status undefined, page=1, pageSize=20）走 coupon:user:{userId} 缓存
   *   - 带 status 过滤 / 翻页时直查 DB（命中率低，避免缓存爆炸）
   */
  async list(userId: string, query: QueryUserCouponDto): Promise<PageResult<UserCouponVo>> {
    const isDefaultQuery =
      query.status === undefined &&
      (query.page === undefined || query.page === 1) &&
      (query.pageSize === undefined || query.pageSize === 20)

    if (isDefaultQuery) {
      const cached = await this.getUserListCache(userId)
      if (cached) return cached
    }

    const qb = this.userCouponRepo
      .createQueryBuilder('uc')
      .where('uc.user_id = :uid AND uc.is_deleted = 0', { uid: userId })
    if (query.status !== undefined) {
      qb.andWhere('uc.status = :st', { st: query.status })
    }
    qb.orderBy('uc.status', 'ASC')
      .addOrderBy('uc.valid_to', 'ASC')
      .skip(query.skip())
      .take(query.take())
    const [rows, total] = await qb.getManyAndCount()

    const couponMap = await this.loadCouponMap(rows.map((r) => r.couponId))
    const list = rows.map((uc) => this.buildVo(uc, couponMap.get(uc.couponId) ?? null))
    const result = makePageResult(list, total, query.page ?? 1, query.pageSize ?? 20)

    if (isDefaultQuery) {
      await this.setUserListCache(userId, result)
    }
    return result
  }

  /* ==========================================================================
   * 五、bestMatch 下单时推荐"最优可用券"
   * ========================================================================== */

  /**
   * 自动推荐当前订单的最优可用券（抵扣最大优先）
   * 参数：userId / dto { orderType, shopId?, totalAmount }
   * 返回值：BestMatchUserCouponVo | null（无可用券时为 null）
   * 用途：GET /me/coupons/best-match
   *
   * 算法：
   *   1) SELECT user_coupon WHERE user_id=? AND status=1 AND valid_to > NOW
   *   2) JOIN coupon（一次性 IN 查询）→ 内存匹配
   *   3) 过滤：scene 匹配（orderType=1 ⇒ scene IN (1,3)；orderType=2 ⇒ scene IN (2,3)）
   *           applicable_shops 包含 shopId 或 NULL（外卖必传 shopId；跑腿不传时跳过店铺过滤）
   *           minOrderAmount ≤ totalAmount
   *   4) 计算每张券 BigNumber 抵扣
   *           couponType=1 满减：discount = discountValue
   *           couponType=2 折扣：discount = totalAmount * (1 - discountValue)；若 maxDiscount 非空再 min
   *           couponType=3 立减：discount = discountValue
   *           couponType=4 免运费：本接口不参与（无 deliveryFee 输入）
   *   5) 返回单张抵扣最大的 user_coupon + estimatedDiscount
   */
  async bestMatch(userId: string, dto: BestMatchQueryDto): Promise<BestMatchUserCouponVo | null> {
    const totalAmount = new BigNumber(dto.totalAmount)
    if (totalAmount.isNaN() || totalAmount.lt(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'totalAmount 必须为非负数字串')
    }

    const ucs = await this.userCouponRepo
      .createQueryBuilder('uc')
      .where('uc.user_id = :uid', { uid: userId })
      .andWhere('uc.status = 1')
      .andWhere('uc.valid_to > NOW(3)')
      .andWhere('uc.is_deleted = 0')
      .getMany()
    if (ucs.length === 0) return null

    const couponMap = await this.loadCouponMap(ucs.map((u) => u.couponId))

    const candidates: DiscountCandidate[] = []
    for (const uc of ucs) {
      const c = couponMap.get(uc.couponId)
      if (!c) continue
      if (c.status !== 1) continue
      if (!this.sceneMatch(c.scene, dto.orderType)) continue
      if (!this.shopMatch(c.applicableShops, dto.shopId)) continue
      const minOrder = new BigNumber(c.minOrderAmount)
      if (totalAmount.lt(minOrder)) continue

      const discount = this.computeDiscount(c, totalAmount)
      if (discount.lte(0)) continue
      candidates.push({ uc, coupon: c, discount })
    }

    if (candidates.length === 0) return null

    /* 抵扣最大；并列时优先 valid_to 更近的（先用过期临近的，避免浪费） */
    candidates.sort((a, b) => {
      /* comparedTo 在两侧均为非 NaN 时一定返回 -1/0/1，null 兜底视为相等 */
      const cmp = b.discount.comparedTo(a.discount) ?? 0
      if (cmp !== 0) return cmp
      return a.uc.validTo.getTime() - b.uc.validTo.getTime()
    })
    const winner = candidates[0]!
    const baseVo = this.buildVo(winner.uc, winner.coupon)
    return {
      ...baseVo,
      estimatedDiscount: this.formatAmount(winner.discount)
    }
  }

  /* ==========================================================================
   * 六、freeze / use / restore 三态流转
   * ========================================================================== */

  /**
   * 冻结一张未使用券（status 1 → 3，订单 pre-check 时锁定）
   * 参数：userCouponId / orderNo（用于日志）
   * 返回值：UserCouponVo
   * 用途：被 Order 模块下单 pre-check 调用（Sprint 3 接入）
   */
  async freeze(userCouponId: string, orderNo: string): Promise<UserCouponVo> {
    const uc = await this.findActiveUserCoupon(userCouponId)
    if (uc.status !== 1) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `券状态非未使用（当前 status=${uc.status}），无法冻结`
      )
    }
    if (uc.validTo.getTime() < Date.now()) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '券已过期，无法使用')
    }
    uc.status = 3
    uc.updatedAt = new Date()
    await this.userCouponRepo.save(uc)
    await this.invalidateUserListCache(uc.userId)
    this.logger.log(`冻结券 ${userCouponId}（用户 ${uc.userId}）→ 订单 ${orderNo}`)
    const coupon = await this.couponService.findActiveById(uc.couponId).catch(() => null)
    return this.buildVo(uc, coupon)
  }

  /**
   * 核销已冻结券（status 3 → 2，支付成功后写 used_at / used_order_no / discount_amount）
   * 参数：userCouponId / orderNo / orderType（1 外卖 / 2 跑腿） / discountAmount（字符串）
   * 返回值：UserCouponVo
   * 用途：被 Order/Payment 在支付成功事件中调用（Sprint 3 接入）
   */
  async use(
    userCouponId: string,
    orderNo: string,
    orderType: number,
    discountAmount: string
  ): Promise<UserCouponVo> {
    if (![1, 2].includes(orderType)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'orderType 必须为 1 / 2')
    }
    const amt = new BigNumber(discountAmount)
    if (amt.isNaN() || amt.lt(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'discountAmount 必须为非负数字串')
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const uc = await manager
        .createQueryBuilder(UserCoupon, 'uc')
        .setLock('pessimistic_write')
        .where('uc.id = :id AND uc.is_deleted = 0', { id: userCouponId })
        .getOne()
      if (!uc) {
        throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '用户券不存在')
      }
      if (uc.status !== 3) {
        throw new BusinessException(
          BizErrorCode.BIZ_STATE_INVALID,
          `券状态非冻结（当前 status=${uc.status}），无法核销`
        )
      }

      const now = new Date()
      uc.status = 2
      uc.usedAt = now
      uc.usedOrderNo = orderNo
      uc.usedOrderType = orderType
      uc.discountAmount = this.formatAmount(amt)
      uc.updatedAt = now
      await manager.save(uc)

      /* 同步 coupon.used_qty++（best-effort：若模板被删，不阻断核销） */
      const c = await manager.findOne(Coupon, { where: { id: uc.couponId } })
      if (c) {
        c.usedQty = c.usedQty + 1
        c.updatedAt = now
        await manager.save(c)
      }
      return uc
    })

    await this.invalidateUserListCache(result.userId)
    await this.couponService.invalidateTplCache(result.couponId)
    this.logger.log(
      `核销券 ${userCouponId}（用户 ${result.userId}）→ 订单 ${orderNo} 抵扣 ${result.discountAmount}`
    )
    const coupon = await this.couponService.findActiveById(result.couponId).catch(() => null)
    return this.buildVo(result, coupon)
  }

  /**
   * 恢复一张冻结券（status 3 → 1，订单取消时调用）
   * 参数：userCouponId
   * 返回值：UserCouponVo
   * 用途：被 Order 模块在 OrderCanceled / pre-check 失败时调用（Sprint 3 接入）
   */
  async restore(userCouponId: string): Promise<UserCouponVo> {
    const uc = await this.findActiveUserCoupon(userCouponId)
    if (uc.status !== 3) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `券状态非冻结（当前 status=${uc.status}），无法恢复`
      )
    }
    /* 已过期不恢复，直接置 0 */
    if (uc.validTo.getTime() < Date.now()) {
      uc.status = 0
    } else {
      uc.status = 1
    }
    uc.updatedAt = new Date()
    await this.userCouponRepo.save(uc)
    await this.invalidateUserListCache(uc.userId)
    this.logger.log(`恢复券 ${userCouponId}（用户 ${uc.userId}）→ status=${uc.status}`)
    const coupon = await this.couponService.findActiveById(uc.couponId).catch(() => null)
    return this.buildVo(uc, coupon)
  }

  /* ==========================================================================
   * 七、expireScan 过期清理 helper
   * ========================================================================== */

  /**
   * 把所有未使用且 valid_to < NOW 的券置为 0 已过期
   * 参数：limit 单批最大处理量（默认 1000，避免一次锁太多行）
   * 返回值：本次处理行数
   * 用途：Sprint 8 由 @nestjs/schedule 定时任务每 5 分钟调一次
   */
  async expireScan(limit = 1000): Promise<number> {
    const result = await this.userCouponRepo
      .createQueryBuilder()
      .update(UserCoupon)
      .set({ status: 0, updatedAt: () => 'NOW(3)' })
      .where('status = 1 AND valid_to < NOW(3) AND is_deleted = 0')
      .limit(limit)
      .execute()
    const affected = result.affected ?? 0
    if (affected > 0) {
      this.logger.log(`expireScan 已过期 ${affected} 张用户券`)
    }
    return affected
  }

  /* ==========================================================================
   * 内部工具
   * ========================================================================== */

  /**
   * 校验领券限流（3s/次/(userId, couponId)）
   * Redis SETNX 失败 → 抛 RATE_LIMIT_EXCEEDED
   */
  private async assertReceiveRateLimit(userId: string, couponId: string): Promise<void> {
    try {
      const key = RECEIVE_RATELIMIT_KEY(userId, couponId)
      const ok = await this.redis.set(key, '1', 'EX', RECEIVE_RATELIMIT_TTL_SECONDS, 'NX')
      if (ok !== 'OK') {
        throw new BusinessException(BizErrorCode.RATE_LIMIT_EXCEEDED, '操作过于频繁，请稍后再试')
      }
    } catch (err) {
      if (err instanceof BusinessException) throw err
      this.logger.warn(
        `[receive] Redis 限流 SETNX 失败（降级放行）user=${userId} coupon=${couponId}：${(err as Error).message}`
      )
    }
  }

  /**
   * 校验券是否可领取（非状态 1 / 已下架 / 不在生效时段 → 抛错）
   * 参数：c Coupon entity；allowFutureValidFrom 管理端批量发放时允许提前发放
   */
  private assertReceivable(c: Coupon, allowFutureValidFrom = false): void {
    if (c.status !== 1) {
      throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '该券已停用或下架')
    }
    if (c.validType === 1) {
      const now = Date.now()
      if (!allowFutureValidFrom && c.validFrom && c.validFrom.getTime() > now) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '该券尚未到生效时间')
      }
      if (c.validTo && c.validTo.getTime() < now) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '该券已过期')
      }
    } else if (c.validType === 2) {
      if (!c.validDays || c.validDays <= 0) {
        throw new BusinessException(
          BizErrorCode.BIZ_STATE_INVALID,
          '券模板配置错误：validType=2 缺失 validDays'
        )
      }
    }
  }

  /**
   * 计算 user_coupon 的生效起止时间
   * - validType=1：沿用模板时段
   * - validType=2：valid_from = NOW；valid_to = NOW + validDays * 24h
   */
  private computeUserCouponValidity(c: Coupon): { validFrom: Date; validTo: Date } {
    const now = new Date()
    if (c.validType === 1) {
      const validFrom = c.validFrom ?? now
      const validTo = c.validTo ?? new Date(now.getTime() + 365 * 24 * 3600 * 1000) /* 兜底一年 */
      return { validFrom, validTo }
    }
    const days = c.validDays ?? 0
    return {
      validFrom: now,
      validTo: new Date(now.getTime() + days * 24 * 3600 * 1000)
    }
  }

  /**
   * 单用户单券的"占用数" COUNT(*)（status IN 1,2,3）
   */
  private async countOccupiedBatch(
    manager: EntityManager,
    couponId: string,
    userIds: string[]
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map()
    const rows = await manager
      .createQueryBuilder(UserCoupon, 'uc')
      .select('uc.user_id', 'uid')
      .addSelect('COUNT(*)', 'cnt')
      .where('uc.coupon_id = :cid', { cid: couponId })
      .andWhere('uc.user_id IN (:...uids)', { uids: userIds })
      .andWhere('uc.status IN (:...sts)', { sts: OCCUPIED_STATUSES })
      .andWhere('uc.is_deleted = 0')
      .groupBy('uc.user_id')
      .getRawMany<{ uid: string; cnt: string }>()
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.uid, parseInt(r.cnt, 10))
    return map
  }

  /**
   * 触发式发放单张券（issueByEvent 内部循环用）；非批量场景，独立小事务
   */
  private async issueOne(userId: string, couponId: string, source: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const c = await manager
        .createQueryBuilder(Coupon, 'c')
        .setLock('pessimistic_write')
        .where('c.id = :id AND c.is_deleted = 0', { id: couponId })
        .getOne()
      if (!c) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '券不存在')
      this.assertReceivable(c, true)

      const occupied = await manager.count(UserCoupon, {
        where: {
          userId,
          couponId,
          status: In(OCCUPIED_STATUSES as unknown as number[]),
          isDeleted: 0
        }
      })
      if (occupied >= c.perUserLimit) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '已达每人限领上限')
      }
      if (c.totalQty > 0 && c.receivedQty >= c.totalQty) {
        throw new BusinessException(BizErrorCode.BIZ_OPERATION_FORBIDDEN, '该券已领完')
      }

      const { validFrom, validTo } = this.computeUserCouponValidity(c)
      const now = new Date()
      const userCoupon = manager.create(UserCoupon, {
        id: SnowflakeId.next(),
        tenantId: 1,
        userId,
        couponId: c.id,
        couponCode: c.couponCode,
        validFrom,
        validTo,
        status: 1,
        usedAt: null,
        usedOrderNo: null,
        usedOrderType: null,
        discountAmount: null,
        receivedSource: source,
        isDeleted: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      })
      await manager.save(userCoupon)
      c.receivedQty = c.receivedQty + 1
      c.updatedAt = now
      await manager.save(c)
    })
  }

  /**
   * 读取触发式发放配置（mock 占位：本期固定返回空数组）
   *
   * 真实实现路径（Sprint 8）：
   *   const row = await sysConfigRepo.findOne({ key: `marketing.event_coupon.${eventType}` })
   *   return row ? JSON.parse(row.value) as EventCouponConfig[] : []
   */
  private async fetchEventConfig(
    _eventType: IssueEventType
  ): Promise<Array<{ couponId: string; qty: number }>> {
    return Promise.resolve([])
  }

  /**
   * 找一条未删除的 user_coupon
   */
  private async findActiveUserCoupon(id: string): Promise<UserCoupon> {
    const uc = await this.userCouponRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!uc) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '用户券不存在')
    }
    return uc
  }

  /**
   * 批量加载券模板（IN 查询）→ Map<id, Coupon>
   */
  private async loadCouponMap(couponIds: string[]): Promise<Map<string, Coupon>> {
    const ids = Array.from(new Set(couponIds))
    if (ids.length === 0) return new Map()
    const rows = await this.couponRepo.find({ where: { id: In(ids) } })
    return new Map(rows.map((c) => [c.id, c]))
  }

  /**
   * scene 与订单类型匹配
   * - orderType=1 外卖：scene IN (1, 3)
   * - orderType=2 跑腿：scene IN (2, 3)
   */
  private sceneMatch(scene: number, orderType: number): boolean {
    if (scene === 3) return true
    if (orderType === 1 && scene === 1) return true
    if (orderType === 2 && scene === 2) return true
    return false
  }

  /**
   * 适用店铺匹配
   * - applicableShops 为 null/空数组 → 全部店铺通过
   * - 入参 shopId 命中数组 → 通过
   */
  private shopMatch(applicableShops: string[] | null, shopId?: string): boolean {
    if (!applicableShops || applicableShops.length === 0) return true
    if (!shopId) return false
    return applicableShops.includes(shopId)
  }

  /**
   * 单张券抵扣金额计算（BigNumber）
   *
   * 注意：本函数由 best-match 调用，假定调用前已通过 minOrderAmount 校验。
   *      免运费券（couponType=4）由于无 deliveryFee 输入，此处返回 0。
   */
  private computeDiscount(c: Coupon, totalAmount: BigNumber): BigNumber {
    switch (c.couponType) {
      case 1: /* 满减 */
      case 3: /* 立减 */ {
        const dv = new BigNumber(c.discountValue)
        /* 抵扣不能超过订单金额（避免负值） */
        return BigNumber.minimum(dv, totalAmount)
      }
      case 2: {
        /* 折扣：discount = totalAmount * (1 - discountValue) */
        const rate = new BigNumber(c.discountValue)
        if (rate.lte(0) || rate.gte(1)) return new BigNumber(0)
        let discount = totalAmount.multipliedBy(new BigNumber(1).minus(rate))
        if (c.maxDiscount) {
          const cap = new BigNumber(c.maxDiscount)
          if (discount.gt(cap)) discount = cap
        }
        return discount
      }
      case 4: /* 免运费：本接口无 deliveryFee 输入，留待 DiscountCalc 处理 */
      default:
        return new BigNumber(0)
    }
  }

  /**
   * BigNumber → 数据库 DECIMAL(8,2) 字符串（保留 2 位 + ROUND_HALF_UP）
   */
  private formatAmount(n: BigNumber): string {
    return n.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFixed(2)
  }

  /**
   * Entity → VO（含从 Coupon 抽取的冗余字段；Coupon 缺失时模板字段为兜底）
   */
  private buildVo(uc: UserCoupon, coupon: Coupon | null): UserCouponVo {
    return {
      id: uc.id,
      userId: uc.userId,
      couponId: uc.couponId,
      couponCode: uc.couponCode,
      couponName: coupon?.name ?? '',
      couponType: coupon?.couponType ?? 0,
      discountValue: coupon?.discountValue ?? '0.00',
      minOrderAmount: coupon?.minOrderAmount ?? '0.00',
      maxDiscount: coupon?.maxDiscount ?? null,
      scene: coupon?.scene ?? 3,
      applicableShops: coupon?.applicableShops ?? null,
      validFrom: uc.validFrom,
      validTo: uc.validTo,
      status: uc.status,
      usedAt: uc.usedAt,
      usedOrderNo: uc.usedOrderNo,
      usedOrderType: uc.usedOrderType,
      discountAmount: uc.discountAmount,
      receivedSource: uc.receivedSource,
      createdAt: uc.createdAt,
      updatedAt: uc.updatedAt
    }
  }

  /**
   * 安全读用户列表缓存
   */
  private async getUserListCache(userId: string): Promise<PageResult<UserCouponVo> | null> {
    try {
      const raw = await this.redis.get(USER_COUPON_LIST_KEY(userId))
      if (!raw) return null
      const obj = JSON.parse(raw) as PageResult<UserCouponVo>
      /* JSON 反序列化丢失 Date 类型，恢复 */
      for (const item of obj.list) {
        item.validFrom = new Date(item.validFrom)
        item.validTo = new Date(item.validTo)
        item.usedAt = item.usedAt ? new Date(item.usedAt) : null
        item.createdAt = new Date(item.createdAt)
        item.updatedAt = new Date(item.updatedAt)
      }
      return obj
    } catch (err) {
      this.logger.warn(`Redis GET ${USER_COUPON_LIST_KEY(userId)} 失败：${(err as Error).message}`)
      return null
    }
  }

  /**
   * 安全写用户列表缓存
   */
  private async setUserListCache(userId: string, value: PageResult<UserCouponVo>): Promise<void> {
    try {
      await this.redis.set(
        USER_COUPON_LIST_KEY(userId),
        JSON.stringify(value),
        'EX',
        USER_COUPON_LIST_TTL_SECONDS
      )
    } catch (err) {
      this.logger.warn(`Redis SET ${USER_COUPON_LIST_KEY(userId)} 失败：${(err as Error).message}`)
    }
  }

  /**
   * 失效用户列表缓存
   */
  private async invalidateUserListCache(userId: string): Promise<void> {
    try {
      await this.redis.del(USER_COUPON_LIST_KEY(userId))
    } catch (err) {
      this.logger.warn(`Redis DEL ${USER_COUPON_LIST_KEY(userId)} 失败：${(err as Error).message}`)
    }
  }

  /**
   * 异步发送领券成功站内信（best-effort：MessageService 未注入或失败均不阻断主业务）
   */
  private async notifyCouponReceived(userId: string, coupon: Coupon, validTo: Date): Promise<void> {
    if (!this.messageService) return
    try {
      await this.messageService.send({
        code: 'USER_COUPON',
        targetType: 1,
        targetId: userId,
        vars: {
          couponName: coupon.name,
          validTo: validTo.toISOString().slice(0, 10)
        },
        category: 4 /* 营销类 */,
        relatedNo: coupon.couponCode
      })
    } catch (err) {
      this.logger.warn(
        `领券通知发送失败 user=${userId} coupon=${coupon.id}：${(err as Error).message}`
      )
    }
  }
}
