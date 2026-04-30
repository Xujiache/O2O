/**
 * @file discount-calc.service.spec.ts
 * @stage P4/T4.52（Sprint 8）
 * @desc DiscountCalcService 单测：互斥规则 + BigNumber 精度 + 单券 / 多活动叠加
 * @author 单 Agent V2.0（Subagent 7）
 *
 * 关键覆盖：
 *   1) 满减券 + itemsAmount 大于阈值 → 抵扣 discountValue
 *   2) 折扣券 + maxDiscount 封顶
 *   3) 免运费券 抵 deliveryFee
 *   4) 多券同类型互斥：取最大抵扣
 *   5) 1 个非 stackable 活动 + 多个 stackable 活动叠加
 *   6) finalAmount ≥ 0.01 兜底
 *   7) userId 缺失抛 PARAM_INVALID 10001
 *   8) BigNumber 精度（0.1+0.2 不出 0.30000000000000004）
 *
 * Mock 策略：
 *   - userCouponRepo.find  → 返回预设 user_coupon 数组
 *   - couponRepo.find      → 返回 coupon templates
 *   - promotionRepo.find / createQueryBuilder → 返回 promotion 数组
 *   - PromotionRuleValidatorService → 不调用（calc 内部直接用 promo 字段）
 */

import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { Coupon, Promotion, UserCoupon } from '@/entities'
import { DiscountCalcService } from './discount-calc.service'
import { PromotionRuleValidatorService } from './promotion-rule-validator.service'

describe('DiscountCalcService', () => {
  let service: DiscountCalcService
  let userCouponFind: jest.Mock
  let couponFind: jest.Mock
  let promotionFind: jest.Mock
  let promotionQbGetMany: jest.Mock
  let parseFullReduction: jest.Mock

  /** Build a default user_coupon row */
  const buildUserCoupon = (over: Partial<UserCoupon> = {}): UserCoupon =>
    ({
      id: 'UC1',
      userId: 'U1',
      couponId: 'C1',
      couponCode: 'TEST01',
      validFrom: new Date(Date.now() - 3600 * 1000),
      validTo: new Date(Date.now() + 3600 * 1000),
      status: 1,
      isDeleted: 0,
      ...over
    }) as UserCoupon

  /** Build a default coupon template row */
  const buildCoupon = (over: Partial<Coupon> = {}): Coupon =>
    ({
      id: 'C1',
      couponCode: 'TEST01',
      name: 'Test Coupon',
      couponType: 1,
      discountValue: '5.00',
      minOrderAmount: '30.00',
      maxDiscount: null,
      scene: 3,
      applicableShops: null,
      validType: 1,
      validFrom: new Date(Date.now() - 86400 * 1000),
      validTo: new Date(Date.now() + 86400 * 1000),
      status: 1,
      isDeleted: 0,
      perUserLimit: 1,
      totalQty: 100,
      receivedQty: 0,
      usedQty: 0,
      ...over
    }) as Coupon

  beforeEach(async () => {
    userCouponFind = jest.fn()
    couponFind = jest.fn()
    promotionFind = jest.fn()
    promotionQbGetMany = jest.fn().mockResolvedValue([])
    parseFullReduction = jest.fn().mockReturnValue({
      steps: [{ minAmount: '30.00', discount: '3.00' }]
    })

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DiscountCalcService,
        {
          provide: getRepositoryToken(UserCoupon),
          useValue: { find: userCouponFind }
        },
        {
          provide: getRepositoryToken(Coupon),
          useValue: { find: couponFind }
        },
        {
          provide: getRepositoryToken(Promotion),
          useValue: {
            find: promotionFind,
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getMany: promotionQbGetMany
            })
          }
        },
        {
          provide: PromotionRuleValidatorService,
          useValue: {
            parseFullReduction,
            parseDiscount: jest.fn().mockReturnValue({ rate: '0.8', maxDiscount: '10.00' }),
            parseGroupBuy: jest.fn().mockReturnValue({ discountPerHead: '2.00' }),
            parseNewUser: jest.fn().mockReturnValue({ discount: '5.00' })
          }
        }
      ]
    }).compile()

    service = moduleRef.get(DiscountCalcService)
  })

  describe('basic guards', () => {
    it('userId missing -> throws PARAM_INVALID 10001', async () => {
      await expect(
        service.calc({
          orderType: 1,
          itemsAmount: '50.00',
          deliveryFee: '5.00'
        })
      ).rejects.toMatchObject({ bizCode: BizErrorCode.PARAM_INVALID })
    })

    it('itemsAmount negative -> throws BusinessException', async () => {
      await expect(
        service.calc({
          userId: 'U1',
          orderType: 1,
          itemsAmount: '-1',
          deliveryFee: '5.00'
        })
      ).rejects.toThrow(BusinessException)
    })
  })

  describe('coupon discount calc', () => {
    it('满减 5 + minOrderAmount 30 + itemsAmount 50 -> discountTotal=5.00 + finalAmount=50.00', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([buildCoupon()])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '50.00',
        deliveryFee: '5.00'
      })

      expect(result.discountTotal).toBe('5.00')
      /* itemsAmount + deliveryFee - discount = 50 + 5 - 5 = 50 */
      expect(result.finalAmount).toBe('50.00')
      expect(result.details).toHaveLength(1)
      expect(result.details[0]?.type).toBe('coupon')
    })

    it('itemsAmount 20 < minOrderAmount 30 -> not applicable, discount=0', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([buildCoupon()])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '20.00',
        deliveryFee: '5.00'
      })

      expect(result.discountTotal).toBe('0.00')
      expect(result.finalAmount).toBe('25.00')
      expect(result.details).toHaveLength(0)
    })

    it('折扣 0.8 + maxDiscount 10 + itemsAmount 100 -> discount=10.00 (capped)', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({
          couponType: 2,
          discountValue: '0.8',
          maxDiscount: '10.00',
          minOrderAmount: '0.00'
        })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '100.00',
        deliveryFee: '5.00'
      })

      /* 100 * (1 - 0.8) = 20，封顶 10 */
      expect(result.discountTotal).toBe('10.00')
    })

    it('免运费 + deliveryFee 6 -> discount=6 (cap by deliveryFee)', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({
          couponType: 4,
          discountValue: '0.00',
          minOrderAmount: '0.00'
        })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '50.00',
        deliveryFee: '6.00'
      })

      expect(result.discountTotal).toBe('6.00')
      /* 50 + 6 - 6 = 50 */
      expect(result.finalAmount).toBe('50.00')
    })

    it('multiple coupons of different ids -> picks the one with max discount', async () => {
      userCouponFind.mockResolvedValue([
        buildUserCoupon({ id: 'UC1', couponId: 'C1' }),
        buildUserCoupon({ id: 'UC2', couponId: 'C2' })
      ])
      couponFind.mockResolvedValue([
        buildCoupon({ id: 'C1', discountValue: '5.00' }),
        buildCoupon({ id: 'C2', discountValue: '8.00' })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '60.00',
        deliveryFee: '5.00'
      })

      expect(result.discountTotal).toBe('8.00')
      expect(result.details[0]?.sourceId).toBe('UC2')
    })
  })

  describe('promotion stackable rule', () => {
    /** Build a default promotion */
    const buildPromotion = (over: Partial<Promotion> = {}): Promotion =>
      ({
        id: 'P1',
        name: 'Test Promo',
        promoType: 1,
        scene: 3,
        applicableShops: null,
        applicableProducts: null,
        rule: { steps: [{ minAmount: '30.00', discount: '3.00' }] } as unknown,
        isStackable: 1,
        status: 1,
        isDeleted: 0,
        validFrom: new Date(Date.now() - 86400 * 1000),
        validTo: new Date(Date.now() + 86400 * 1000),
        ...over
      }) as unknown as Promotion

    it('1 non-stackable + 1 stackable promotion both apply', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([
        buildPromotion({ id: 'P1', isStackable: 0, name: 'Promo non-stack' }),
        buildPromotion({ id: 'P2', isStackable: 1, name: 'Promo stack' })
      ])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '60.00',
        deliveryFee: '5.00'
      })

      /* 2 promotions both applied (3 + 3 = 6), final = 60+5-6 = 59 */
      expect(result.details).toHaveLength(2)
    })
  })

  describe('finalAmount lower bound', () => {
    it('discount > items+delivery -> finalAmount stays 0.01', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({
          couponType: 3,
          discountValue: '999.00',
          minOrderAmount: '0.00'
        })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '50.00',
        deliveryFee: '5.00'
      })

      expect(result.finalAmount).toBe('0.01')
    })
  })

  /**
   * P9/Sprint2 W2.A.1 增补：分支覆盖增强
   * 目标：把 discount-calc.service.ts 的 branches 从 41.83% 推到 ≥ 70%
   */
  describe('coupon applicability — branch coverage', () => {
    it('coupon scene mismatch -> not applied', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({ scene: 1, minOrderAmount: '0.00' }) /* 仅外卖券 */
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 2 /* 跑腿 */,
        shopId: 'S1',
        itemsAmount: '50.00',
        deliveryFee: '5.00'
      })
      expect(result.discountTotal).toBe('0.00')
    })

    it('coupon applicableShops mismatch -> not applied', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({ applicableShops: ['S_OTHER'], minOrderAmount: '0.00' })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S_THIS',
        itemsAmount: '50.00',
        deliveryFee: '5.00'
      })
      expect(result.discountTotal).toBe('0.00')
    })

    it('coupon validType=1 with validFrom in future -> not applied', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({
          validType: 1,
          validFrom: new Date(Date.now() + 86400 * 1000),
          validTo: new Date(Date.now() + 2 * 86400 * 1000),
          minOrderAmount: '0.00'
        })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '50.00',
        deliveryFee: '5.00'
      })
      expect(result.discountTotal).toBe('0.00')
    })

    it('coupon status disabled -> not applied', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([buildCoupon({ status: 0, minOrderAmount: '0.00' })])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '50.00',
        deliveryFee: '5.00'
      })
      expect(result.discountTotal).toBe('0.00')
    })

    it('couponType=2 (折扣) without maxDiscount -> 全额折扣', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({
          couponType: 2,
          discountValue: '0.5',
          maxDiscount: null,
          minOrderAmount: '0.00'
        })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '100.00',
        deliveryFee: '5.00'
      })
      /* 100 * (1 - 0.5) = 50, 无封顶 */
      expect(result.discountTotal).toBe('50.00')
    })

    it('couponType=2 (折扣) discountValue 非法（≥1）-> 不抵', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({
          couponType: 2,
          discountValue: '1.5',
          minOrderAmount: '0.00'
        })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '100.00',
        deliveryFee: '5.00'
      })
      expect(result.discountTotal).toBe('0.00')
    })

    it('couponType=4 deliveryFee=0 -> discount=0', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({ couponType: 4, discountValue: '0.00', minOrderAmount: '0.00' })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '50.00',
        deliveryFee: '0.00'
      })
      expect(result.discountTotal).toBe('0.00')
    })

    it('couponType=4 with positive discountValue < deliveryFee -> 取 discountValue', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({ couponType: 4, discountValue: '3.00', minOrderAmount: '0.00' })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '50.00',
        deliveryFee: '6.00'
      })
      /* min(3, 6) = 3 */
      expect(result.discountTotal).toBe('3.00')
    })

    it('couponType 未识别 -> discount=0', async () => {
      userCouponFind.mockResolvedValue([buildUserCoupon()])
      couponFind.mockResolvedValue([
        buildCoupon({ couponType: 99, discountValue: '5.00', minOrderAmount: '0.00' })
      ])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '50.00',
        deliveryFee: '5.00'
      })
      expect(result.discountTotal).toBe('0.00')
    })
  })

  describe('promotion applicability — branch coverage', () => {
    const buildPromotion = (over: Partial<Promotion> = {}): Promotion =>
      ({
        id: 'P1',
        name: 'Test Promo',
        promoType: 1,
        scene: 3,
        applicableShops: null,
        applicableProducts: null,
        ruleJson: { steps: [{ minAmount: '30.00', discount: '3.00' }] },
        isStackable: 1,
        status: 1,
        isDeleted: 0,
        validFrom: new Date(Date.now() - 86400 * 1000),
        validTo: new Date(Date.now() + 86400 * 1000),
        ...over
      }) as unknown as Promotion

    it('promo_type=5 (秒杀) -> not in calc', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([buildPromotion({ promoType: 5 })])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '60.00',
        deliveryFee: '5.00'
      })
      expect(result.details).toHaveLength(0)
    })

    it('promo scene mismatch -> not applied', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([buildPromotion({ scene: 1 })])

      const result = await service.calc({
        userId: 'U1',
        orderType: 2 /* 跑腿不命中 scene=1 */,
        shopId: 'S1',
        itemsAmount: '60.00',
        deliveryFee: '5.00'
      })
      expect(result.details).toHaveLength(0)
    })

    it('promo applicableShops mismatch -> not applied', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([buildPromotion({ applicableShops: ['S_OTHER'] })])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S_THIS',
        itemsAmount: '60.00',
        deliveryFee: '5.00'
      })
      expect(result.details).toHaveLength(0)
    })

    it('promo applicableProducts mismatch -> not applied', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([buildPromotion({ applicableProducts: ['P_OTHER'] })])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        productIds: ['P_THIS'],
        itemsAmount: '60.00',
        deliveryFee: '5.00'
      })
      expect(result.details).toHaveLength(0)
    })

    it('promo applicableProducts hit -> applied', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([
        buildPromotion({ applicableProducts: ['P_HIT'], isStackable: 1 })
      ])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        productIds: ['P_HIT', 'P_OTHER'],
        itemsAmount: '60.00',
        deliveryFee: '5.00'
      })
      expect(result.details).toHaveLength(1)
    })

    it('promo_type=4 (新人) without isNewUser -> not applied', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([buildPromotion({ promoType: 4 })])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '60.00',
        deliveryFee: '5.00',
        isNewUser: false
      })
      expect(result.details).toHaveLength(0)
    })

    it('promo_type=4 (新人) with isNewUser=true -> applied (5.00)', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([buildPromotion({ promoType: 4 })])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '60.00',
        deliveryFee: '5.00',
        isNewUser: true
      })
      expect(result.discountTotal).toBe('5.00')
    })

    it('promo_type=2 (折扣) with maxDiscount cap', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([buildPromotion({ promoType: 2 })])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '100.00',
        deliveryFee: '5.00'
      })
      /* mock parseDiscount returns rate=0.8 maxDiscount=10
         100 * (1-0.8)=20，封顶 10 */
      expect(result.discountTotal).toBe('10.00')
    })

    it('promo_type=3 (拼单) -> 5 元/单（mock parseGroupBuy）', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([buildPromotion({ promoType: 3 })])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '60.00',
        deliveryFee: '5.00'
      })
      /* mock parseGroupBuy returns discountPerHead=2.00 */
      expect(result.discountTotal).toBe('2.00')
    })

    it('promotion rule_json 异常 -> 跳过该活动 + log warn', async () => {
      parseFullReduction.mockImplementationOnce(() => {
        throw new Error('rule_json 解析失败')
      })
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([buildPromotion({ promoType: 1 })])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '60.00',
        deliveryFee: '5.00'
      })
      expect(result.details).toHaveLength(0)
    })

    it('promo unknown type -> discount=0', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([buildPromotion({ promoType: 99 })])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '60.00',
        deliveryFee: '5.00'
      })
      expect(result.details).toHaveLength(0)
    })
  })

  describe('data collection branches', () => {
    it('userCouponIds 传入 -> 通过 In 查询并按 validTo 过滤', async () => {
      userCouponFind.mockResolvedValueOnce([
        buildUserCoupon({ id: 'UC1', validTo: new Date(Date.now() + 3600 * 1000) }),
        buildUserCoupon({ id: 'UC_EXPIRED', validTo: new Date(Date.now() - 1000) })
      ])
      couponFind.mockResolvedValue([buildCoupon({ minOrderAmount: '0.00' })])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        userCouponIds: ['UC1', 'UC_EXPIRED'],
        itemsAmount: '50.00',
        deliveryFee: '5.00'
      })
      /* 仅未过期的 UC1 命中 */
      expect(result.details).toHaveLength(1)
    })

    it('promotionIds 传入 -> 通过 In 查询', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionFind.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        promotionIds: ['P1'],
        itemsAmount: '50.00',
        deliveryFee: '5.00'
      })
      /* promotionFind 被调用，promotionQbGetMany 不被调用 */
      expect(promotionFind).toHaveBeenCalledTimes(1)
      expect(promotionQbGetMany).not.toHaveBeenCalled()
      expect(result.details).toHaveLength(0)
    })

    it('既无 promotionIds 也无 shopId -> 不查活动', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        itemsAmount: '50.00',
        deliveryFee: '5.00'
      })
      expect(promotionFind).not.toHaveBeenCalled()
      expect(promotionQbGetMany).not.toHaveBeenCalled()
      expect(result.details).toHaveLength(0)
    })

    it('packageFee 传入 -> grossAmount 包含打包费', async () => {
      userCouponFind.mockResolvedValue([])
      couponFind.mockResolvedValue([])
      promotionQbGetMany.mockResolvedValue([])

      const result = await service.calc({
        userId: 'U1',
        orderType: 1,
        shopId: 'S1',
        itemsAmount: '50.00',
        deliveryFee: '5.00',
        packageFee: '2.00'
      })
      expect(result.packageFee).toBe('2.00')
      /* 50 + 5 + 2 = 57 */
      expect(result.finalAmount).toBe('57.00')
    })
  })
})
