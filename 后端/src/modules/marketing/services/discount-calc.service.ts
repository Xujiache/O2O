/**
 * @file discount-calc.service.ts
 * @stage P4/T4.13（Sprint 2）
 * @desc 下单时优惠计算 + 互斥校验：DiscountCalc.calc(ctx)
 * @author 单 Agent V2.0
 *
 * 算法（CONSENSUS §2.8）：
 *   1. 数据收集：
 *      - couponBucket：用户传入 userCouponIds，否则查 user_coupon status=1 + 未过期
 *      - promotionBucket：用户传入 promotionIds；否则查店铺当前进行中活动
 *   2. 过滤可用：scope (applicable_shops/products) / scene / 时段 / 阈值 minOrderAmount
 *   3. 互斥规则：
 *      - 同类型优惠券：couponBucket 取最大抵扣（仅用 1 张）
 *      - 同类型活动：1 个 非 stackable + 多个 stackable 可叠加
 *      - 跨类型默认可叠加：1 券 + 1 非 stackable + N stackable
 *   4. 计算抵扣：
 *      - 满减：itemsAmount ≥ minOrderAmount → 抵
 *      - 折扣：itemsAmount * (1 - rate)，封顶 maxDiscount
 *      - 立减：直接减 discountValue
 *      - 免运费：抵 deliveryFee（≤ deliveryFee）
 *      - 阶梯满减：steps DESC 找首个匹配 minAmount
 *   5. finalAmount = max(0.01, itemsAmount + deliveryFee + packageFee - discountTotal)
 *   6. 全程 BigNumber 计算，2 位小数
 *
 * 输出：
 *   - discountTotal 总抵扣
 *   - finalAmount   ≥ 0.01
 *   - details       明细（含 type / sourceId / name / amount）
 *
 * 不实现：red_packet（Agent C 后续接入）；best-match 推荐（Agent A 在 user-coupon.service 提供）；
 *        本 service 仅在给定 userCouponIds 内取最大抵扣。
 */

import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { Coupon, Promotion, UserCoupon } from '@/entities'
import {
  type DiscountCalcContextDto,
  type DiscountCalcResultDto,
  type DiscountItemDto
} from '../dto/discount-calc.dto'
import { type DiscountRule, type FullReductionRule, type NewUserRule } from '../dto/promotion.dto'
import { PromotionRuleValidatorService } from './promotion-rule-validator.service'

/* ============================================================================
 * 内部类型
 * ============================================================================ */

/** 单条候选抵扣（用于排序/择优） */
interface Candidate {
  type: 'coupon' | 'promotion'
  sourceId: string
  name: string
  amount: BigNumber
  /** 是否可叠加：coupon 永远 false（仅 1 张）；promotion 取 is_stackable */
  stackable: boolean
}

@Injectable()
export class DiscountCalcService {
  private readonly logger = new Logger(DiscountCalcService.name)

  constructor(
    @InjectRepository(UserCoupon)
    private readonly userCouponRepo: Repository<UserCoupon>,
    @InjectRepository(Coupon) private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(Promotion) private readonly promotionRepo: Repository<Promotion>,
    private readonly ruleValidator: PromotionRuleValidatorService
  ) {}

  /**
   * 入口：计算下单优惠
   * 参数：ctx —— DiscountCalcContext（userId 必须在 controller 端注入）
   * 返回值：DiscountCalcResult
   * 用途：POST /me/discount-preview / Order 模块下单时调用
   */
  async calc(ctx: DiscountCalcContextDto): Promise<DiscountCalcResultDto> {
    if (!ctx.userId) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'DiscountCalc 缺少 userId')
    }

    const itemsAmount = this.toBn(ctx.itemsAmount, 'itemsAmount')
    const deliveryFee = this.toBn(ctx.deliveryFee, 'deliveryFee')
    const packageFee = ctx.packageFee ? this.toBn(ctx.packageFee, 'packageFee') : new BigNumber(0)
    const now = new Date()

    /* 1. 数据收集 */
    const [userCoupons, promotions] = await Promise.all([
      this.collectUserCoupons(ctx.userId, ctx.userCouponIds),
      this.collectPromotions(ctx.shopId, ctx.promotionIds, now)
    ])

    const couponMap = await this.loadCouponTemplates(userCoupons.map((uc) => uc.couponId))

    /* 2. 过滤可用 + 计算每条候选的抵扣 */
    const couponCandidates: Candidate[] = []
    for (const uc of userCoupons) {
      const tpl = couponMap.get(uc.couponId)
      if (!tpl) continue
      if (!this.isCouponApplicable(tpl, uc, ctx, now)) continue
      const amount = this.computeCouponDiscount(tpl, itemsAmount, deliveryFee)
      if (amount.lte(0)) continue
      couponCandidates.push({
        type: 'coupon',
        sourceId: uc.id,
        name: tpl.name,
        amount,
        stackable: false
      })
    }

    const promoCandidates: Candidate[] = []
    for (const promo of promotions) {
      if (!this.isPromotionApplicable(promo, ctx, now)) continue
      const amount = this.computePromotionDiscount(promo, itemsAmount, deliveryFee)
      if (amount.lte(0)) continue
      promoCandidates.push({
        type: 'promotion',
        sourceId: promo.id,
        name: promo.name,
        amount,
        stackable: promo.isStackable === 1
      })
    }

    /* 3. 互斥规则 */
    const winners: Candidate[] = []

    /* 3.1 优惠券：取最大抵扣 1 张 */
    if (couponCandidates.length > 0) {
      const bestCoupon = couponCandidates.reduce((a, b) => (a.amount.gte(b.amount) ? a : b))
      winners.push(bestCoupon)
    }

    /* 3.2 活动：1 个非 stackable + 全部 stackable */
    const nonStackable = promoCandidates.filter((c) => !c.stackable)
    const stackable = promoCandidates.filter((c) => c.stackable)
    if (nonStackable.length > 0) {
      const bestNonStackable = nonStackable.reduce((a, b) => (a.amount.gte(b.amount) ? a : b))
      winners.push(bestNonStackable)
    }
    winners.push(...stackable)

    /* 4. 汇总 */
    const discountTotal = winners.reduce((acc, w) => acc.plus(w.amount), new BigNumber(0))
    const grossAmount = itemsAmount.plus(deliveryFee).plus(packageFee)
    const minPayable = new BigNumber('0.01')
    let finalAmount = grossAmount.minus(discountTotal)
    if (finalAmount.lt(minPayable)) finalAmount = minPayable

    const details: DiscountItemDto[] = winners.map((w) => ({
      type: w.type,
      sourceId: w.sourceId,
      name: w.name,
      amount: w.amount.toFixed(2)
    }))

    return {
      itemsAmount: itemsAmount.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      packageFee: packageFee.toFixed(2),
      discountTotal: discountTotal.toFixed(2),
      finalAmount: finalAmount.toFixed(2),
      details
    }
  }

  /* ==========================================================================
   * 数据收集
   * ========================================================================== */

  /**
   * 拉取候选 user_coupon
   * 参数：
   *   - userId         当前用户
   *   - userCouponIds  用户主动选中的券（不传 = 自动加载用户全部 status=1 user_coupon）
   * 返回值：UserCoupon[]
   */
  private async collectUserCoupons(
    userId: string,
    userCouponIds: string[] | undefined
  ): Promise<UserCoupon[]> {
    const now = new Date()
    if (userCouponIds && userCouponIds.length > 0) {
      const rows = await this.userCouponRepo.find({
        where: { id: In(userCouponIds), userId, status: 1, isDeleted: 0 }
      })
      return rows.filter((uc) => uc.validTo.getTime() > now.getTime())
    }
    return this.userCouponRepo.find({
      where: {
        userId,
        status: 1,
        isDeleted: 0,
        validTo: MoreThanOrEqual(now)
      }
    })
  }

  /**
   * 加载 coupon 模板（按 couponId 去重批量查）
   */
  private async loadCouponTemplates(couponIds: string[]): Promise<Map<string, Coupon>> {
    const map = new Map<string, Coupon>()
    if (couponIds.length === 0) return map
    const uniq = Array.from(new Set(couponIds))
    const rows = await this.couponRepo.find({
      where: { id: In(uniq), isDeleted: 0 }
    })
    for (const r of rows) map.set(r.id, r)
    return map
  }

  /**
   * 拉取候选 promotion
   * 参数：
   *   - shopId         可选；用于自动加载店铺活动
   *   - promotionIds   用户传入；不传则按 shopId 自动加载
   *   - now            当前时间
   * 返回值：Promotion[]
   */
  private async collectPromotions(
    shopId: string | undefined,
    promotionIds: string[] | undefined,
    now: Date
  ): Promise<Promotion[]> {
    if (promotionIds && promotionIds.length > 0) {
      const rows = await this.promotionRepo.find({
        where: {
          id: In(promotionIds),
          status: 1,
          isDeleted: 0,
          validFrom: LessThanOrEqual(now),
          validTo: MoreThanOrEqual(now)
        }
      })
      return rows
    }
    if (!shopId) return []
    const rows = await this.promotionRepo
      .createQueryBuilder('p')
      .where('p.is_deleted = 0')
      .andWhere('p.status = 1')
      .andWhere('p.valid_from <= :now', { now })
      .andWhere('p.valid_to >= :now', { now })
      .andWhere(
        // applicable_shops 为 null（全部店铺）或包含 shopId
        '(p.applicable_shops IS NULL OR JSON_CONTAINS(p.applicable_shops, JSON_QUOTE(:shopId)) = 1)',
        { shopId }
      )
      .getMany()
    return rows
  }

  /* ==========================================================================
   * 适用性校验
   * ========================================================================== */

  /**
   * 校验优惠券是否可用
   *   - status=1 / 未过期（已在 SQL 过滤）
   *   - scene 匹配（scene=3 通用）
   *   - applicable_shops 命中（NULL 全部）
   *   - itemsAmount ≥ minOrderAmount
   */
  private isCouponApplicable(
    tpl: Coupon,
    _uc: UserCoupon,
    ctx: DiscountCalcContextDto,
    now: Date
  ): boolean {
    if (tpl.status !== 1) return false
    /* scene：1 外卖 / 2 跑腿 / 3 通用 */
    if (tpl.scene !== 3 && tpl.scene !== ctx.orderType) return false
    /* applicable_shops 校验 */
    if (tpl.applicableShops && tpl.applicableShops.length > 0) {
      if (!ctx.shopId || !tpl.applicableShops.includes(ctx.shopId)) return false
    }
    /* 模板自身有效期（valid_type=1 固定时段） */
    if (tpl.validType === 1) {
      if (tpl.validFrom && tpl.validFrom.getTime() > now.getTime()) return false
      if (tpl.validTo && tpl.validTo.getTime() < now.getTime()) return false
    }
    /* 阈值校验 */
    if (tpl.minOrderAmount) {
      const items = new BigNumber(ctx.itemsAmount)
      if (items.lt(new BigNumber(tpl.minOrderAmount))) return false
    }
    return true
  }

  /**
   * 校验活动是否可用
   *   - 时段 / 状态（已在 SQL 过滤）
   *   - scene 匹配（scene=3 通用）
   *   - applicable_shops / applicable_products 命中
   *   - 新人福利：isNewUser=true 才命中
   *   - 秒杀（promo_type=5）：本 calc 不展开（订单环节再实际扣减库存与替换价格）
   */
  private isPromotionApplicable(
    promo: Promotion,
    ctx: DiscountCalcContextDto,
    _now: Date
  ): boolean {
    /* 秒杀：calc 不参与，由订单创建时直接走秒杀价 */
    if (promo.promoType === 5) return false
    /* scene 匹配 */
    if (promo.scene !== 3 && promo.scene !== ctx.orderType) return false
    /* 适用店铺 */
    if (promo.applicableShops && promo.applicableShops.length > 0) {
      if (!ctx.shopId || !promo.applicableShops.includes(ctx.shopId)) return false
    }
    /* 适用商品（任意命中即可；空入参 productIds 直接拒） */
    if (promo.applicableProducts && promo.applicableProducts.length > 0) {
      const userPids = ctx.productIds ?? []
      const hit = userPids.some((pid) => promo.applicableProducts?.includes(pid) === true)
      if (!hit) return false
    }
    /* 新人福利：必须 isNewUser=true */
    if (promo.promoType === 4) {
      if (ctx.isNewUser !== true) return false
    }
    return true
  }

  /* ==========================================================================
   * 抵扣计算
   * ========================================================================== */

  /**
   * 计算优惠券抵扣
   *   coupon_type:
   *     1 满减 → discountValue（条件已在 isApplicable 过滤过 minOrderAmount）
   *     2 折扣 → itemsAmount * (1 - discountValue)，封顶 maxDiscount
   *     3 立减 → discountValue
   *     4 免运费 → min(deliveryFee, discountValue || deliveryFee)
   */
  private computeCouponDiscount(
    tpl: Coupon,
    itemsAmount: BigNumber,
    deliveryFee: BigNumber
  ): BigNumber {
    const value = new BigNumber(tpl.discountValue || '0')
    switch (tpl.couponType) {
      case 1:
        return value
      case 2: {
        const rate = new BigNumber(tpl.discountValue || '0')
        if (!rate.isFinite() || rate.lte(0) || rate.gte(1)) return new BigNumber(0)
        const discount = itemsAmount.multipliedBy(new BigNumber(1).minus(rate))
        if (tpl.maxDiscount && new BigNumber(tpl.maxDiscount).gt(0)) {
          const cap = new BigNumber(tpl.maxDiscount)
          return discount.gt(cap) ? cap : discount
        }
        return discount
      }
      case 3:
        return value
      case 4: {
        if (deliveryFee.lte(0)) return new BigNumber(0)
        if (value.gt(0) && value.lt(deliveryFee)) return value
        return deliveryFee
      }
      default:
        return new BigNumber(0)
    }
  }

  /**
   * 计算活动抵扣
   *   promo_type:
   *     1 满减（FullReductionRule.steps）→ steps DESC 找首个 minAmount ≤ itemsAmount → discount
   *     2 折扣（DiscountRule.rate, maxDiscount）→ items * (1 - rate)，封顶 maxDiscount
   *     3 拼单（GroupBuyRule.discountPerHead）→ 每人减
   *     4 新人福利（NewUserRule.discount）→ 立减
   *     5 秒杀 → 不在 calc
   */
  private computePromotionDiscount(
    promo: Promotion,
    itemsAmount: BigNumber,
    _deliveryFee: BigNumber
  ): BigNumber {
    try {
      switch (promo.promoType) {
        case 1: {
          const rule: FullReductionRule = this.ruleValidator.parseFullReduction(promo.ruleJson)
          /* steps 按 minAmount DESC 找首个匹配（comparedTo 在 NaN 下返回 null，这里 rule 已校验为正数，做兜底回 0） */
          const sorted = [...rule.steps].sort(
            (a, b) => new BigNumber(b.minAmount).comparedTo(new BigNumber(a.minAmount)) ?? 0
          )
          for (const step of sorted) {
            const min = new BigNumber(step.minAmount)
            if (itemsAmount.gte(min)) return new BigNumber(step.discount)
          }
          return new BigNumber(0)
        }
        case 2: {
          const rule: DiscountRule = this.ruleValidator.parseDiscount(promo.ruleJson)
          const rate = new BigNumber(rule.rate)
          const discount = itemsAmount.multipliedBy(new BigNumber(1).minus(rate))
          if (rule.maxDiscount && new BigNumber(rule.maxDiscount).gt(0)) {
            const cap = new BigNumber(rule.maxDiscount)
            return discount.gt(cap) ? cap : discount
          }
          return discount
        }
        case 3: {
          const rule = this.ruleValidator.parseGroupBuy(promo.ruleJson)
          return new BigNumber(rule.discountPerHead)
        }
        case 4: {
          const rule: NewUserRule = this.ruleValidator.parseNewUser(promo.ruleJson)
          return new BigNumber(rule.discount)
        }
        default:
          return new BigNumber(0)
      }
    } catch (err) {
      /* rule_json 异常时记录警告并跳过该活动；避免单条脏数据导致整笔订单失败 */
      this.logger.warn(
        `活动 ${promo.id}（type=${promo.promoType}）rule_json 校验失败：${(err as Error).message}`
      )
      return new BigNumber(0)
    }
  }

  /* ==========================================================================
   * 工具
   * ========================================================================== */

  /** 字符串/数字 → BigNumber，禁止 NaN / 负数 */
  private toBn(value: string, label: string): BigNumber {
    const bn = new BigNumber(value)
    if (!bn.isFinite() || bn.lt(0)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `${label} 必须为非负合法金额：当前 ${value}`
      )
    }
    return bn
  }
}
