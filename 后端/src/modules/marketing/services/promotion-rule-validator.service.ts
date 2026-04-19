/**
 * @file promotion-rule-validator.service.ts
 * @stage P4/T4.11（Sprint 2）
 * @desc 5 类 promo_type 的 rule_json schema 强校验（独立 helper，便于单测/复用）
 * @author 单 Agent V2.0
 *
 * 设计：
 *   - 入参 ruleJson 类型为 unknown / Record<string, unknown>
 *   - 校验失败统一抛 BusinessException(PARAM_INVALID, '具体字段错误信息')
 *   - parseXxx() 系列方法在校验后类型收窄到对应 RuleDto，供 service 安全消费
 *   - 全程不依赖 class-validator（rule_json 是动态结构，更适合手写校验）
 */

import { Injectable } from '@nestjs/common'
import BigNumber from 'bignumber.js'
import { BizErrorCode, BusinessException } from '@/common'
import type {
  DiscountRule,
  FullReductionRule,
  FullReductionStep,
  GroupBuyRule,
  NewUserRule,
  SeckillRule
} from '../dto/promotion.dto'

@Injectable()
export class PromotionRuleValidatorService {
  /**
   * 主入口：按 promoType 走对应校验
   * 参数：promoType 1~5；ruleJson 任意对象
   * 返回值：void（失败抛 BusinessException）
   * 用途：promotion.service 的 create/update 在持久化前调用
   */
  validate(promoType: number, ruleJson: unknown): void {
    switch (promoType) {
      case 1:
        this.parseFullReduction(ruleJson)
        return
      case 2:
        this.parseDiscount(ruleJson)
        return
      case 3:
        this.parseGroupBuy(ruleJson)
        return
      case 4:
        this.parseNewUser(ruleJson)
        return
      case 5:
        this.parseSeckill(ruleJson)
        return
      default:
        throw new BusinessException(
          BizErrorCode.PARAM_INVALID,
          `promoType 非法：${String(promoType)}（合法值 1~5）`
        )
    }
  }

  /* ==========================================================================
   * 1. 满减 FullReductionRule
   * ========================================================================== */

  /**
   * 解析满减规则 → 类型化 FullReductionRule
   * 校验：
   *   - steps 非空数组（≥ 1 阶梯）
   *   - 每条 step.minAmount / step.discount 为合法非负金额字符串
   *   - discount > 0；minAmount > 0
   */
  parseFullReduction(json: unknown): FullReductionRule {
    const obj = this.assertPlainObject(json, '满减规则')
    const steps = obj.steps
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '满减规则 steps 必须为非空数组')
    }
    if (steps.length > 50) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        '满减规则 steps 阶梯过多（最多 50 条）'
      )
    }
    const parsedSteps: FullReductionStep[] = steps.map((s, idx) =>
      this.parseFullReductionStep(s, idx)
    )
    return { steps: parsedSteps }
  }

  private parseFullReductionStep(s: unknown, idx: number): FullReductionStep {
    const step = this.assertPlainObject(s, `满减规则 steps[${idx}]`)
    const minAmount = this.assertPositiveAmount(step.minAmount, `满减 steps[${idx}].minAmount`)
    const discount = this.assertPositiveAmount(step.discount, `满减 steps[${idx}].discount`)
    if (new BigNumber(discount).gte(minAmount)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `满减 steps[${idx}] discount(${discount}) 不能 ≥ minAmount(${minAmount})`
      )
    }
    return { minAmount, discount }
  }

  /* ==========================================================================
   * 2. 折扣 DiscountRule
   * ========================================================================== */

  /**
   * 解析折扣规则 → 类型化 DiscountRule
   * 校验：
   *   - rate ∈ (0, 1) （0.85 表示 85 折）
   *   - maxDiscount 可选，> 0
   */
  parseDiscount(json: unknown): DiscountRule {
    const obj = this.assertPlainObject(json, '折扣规则')
    const rateStr = this.assertNonEmptyString(obj.rate, '折扣 rate')
    const rate = new BigNumber(rateStr)
    if (!rate.isFinite() || rate.lte(0) || rate.gte(1)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `折扣 rate 必须在 (0, 1) 区间：当前 ${rateStr}`
      )
    }
    const result: DiscountRule = { rate: rate.toString() }
    if (obj.maxDiscount !== undefined && obj.maxDiscount !== null) {
      result.maxDiscount = this.assertPositiveAmount(obj.maxDiscount, '折扣 maxDiscount')
    }
    return result
  }

  /* ==========================================================================
   * 3. 拼单 GroupBuyRule
   * ========================================================================== */

  /**
   * 解析拼单规则 → 类型化 GroupBuyRule
   * 校验：
   *   - groupSize ≥ 2 且 ≤ 100（业务上限）
   *   - discountPerHead > 0
   *   - timeoutMinutes ∈ [1, 1440]（最多 24 小时）
   */
  parseGroupBuy(json: unknown): GroupBuyRule {
    const obj = this.assertPlainObject(json, '拼单规则')
    const groupSize = this.assertInt(obj.groupSize, '拼单 groupSize', 2, 100)
    const discountPerHead = this.assertPositiveAmount(obj.discountPerHead, '拼单 discountPerHead')
    const timeoutMinutes = this.assertInt(obj.timeoutMinutes, '拼单 timeoutMinutes', 1, 1440)
    return { groupSize, discountPerHead, timeoutMinutes }
  }

  /* ==========================================================================
   * 4. 新人福利 NewUserRule
   * ========================================================================== */

  /**
   * 解析新人福利规则 → 类型化 NewUserRule
   * 校验：
   *   - discount > 0
   *   - firstOrderOnly 必须显式为 true（强约束：只面向首单）
   */
  parseNewUser(json: unknown): NewUserRule {
    const obj = this.assertPlainObject(json, '新人福利规则')
    const discount = this.assertPositiveAmount(obj.discount, '新人福利 discount')
    if (obj.firstOrderOnly !== true) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        '新人福利规则 firstOrderOnly 必须为 true'
      )
    }
    return { discount, firstOrderOnly: true }
  }

  /* ==========================================================================
   * 5. 限时秒杀 SeckillRule
   * ========================================================================== */

  /**
   * 解析秒杀规则 → 类型化 SeckillRule
   * 校验：
   *   - price > 0
   *   - qty ≥ 1（秒杀总量；与 promotion.totalQty 同步即可，service 层会校验一致性）
   *   - perUserLimit ≥ 1
   */
  parseSeckill(json: unknown): SeckillRule {
    const obj = this.assertPlainObject(json, '秒杀规则')
    const price = this.assertPositiveAmount(obj.price, '秒杀 price')
    const qty = this.assertInt(obj.qty, '秒杀 qty', 1, 1_000_000)
    const perUserLimit = this.assertInt(obj.perUserLimit, '秒杀 perUserLimit', 1, 10000)
    return { price, qty, perUserLimit }
  }

  /* ==========================================================================
   * 通用 helpers
   * ========================================================================== */

  /**
   * 断言为非 null 普通对象（非数组）
   */
  private assertPlainObject(value: unknown, label: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, `${label} 必须为对象`)
    }
    return value as Record<string, unknown>
  }

  /**
   * 断言为非空字符串
   */
  private assertNonEmptyString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, `${label} 必须为非空字符串`)
    }
    return value.trim()
  }

  /**
   * 断言为合法 > 0 金额字符串（最多 2 位小数；返回归一化字符串）
   * 接受 string / number 输入；不接受 NaN / Infinity / 负数 / 零
   */
  private assertPositiveAmount(value: unknown, label: string): string {
    let raw: string
    if (typeof value === 'number') raw = String(value)
    else if (typeof value === 'string') raw = value.trim()
    else {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, `${label} 必须为金额字符串`)
    }
    const bn = new BigNumber(raw)
    if (!bn.isFinite() || bn.lte(0)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `${label} 必须为大于 0 的合法金额：当前 ${raw}`
      )
    }
    if (bn.decimalPlaces() !== null && (bn.decimalPlaces() ?? 0) > 2) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `${label} 小数位数不能超过 2：当前 ${raw}`
      )
    }
    return bn.toFixed(2)
  }

  /**
   * 断言为整数，且在 [min, max]（含）范围内
   */
  private assertInt(value: unknown, label: string, min: number, max: number): number {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        `${label} 必须为 ${min}~${max} 的整数：当前 ${String(value)}`
      )
    }
    return n
  }
}
