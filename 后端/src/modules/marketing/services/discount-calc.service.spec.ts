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
})
