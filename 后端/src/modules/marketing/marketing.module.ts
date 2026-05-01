/**
 * @file marketing.module.ts
 * @stage P4/T4.9~T4.13（Sprint 2 整合）
 * @desc 营销模块装配：优惠券 + 用户券 + 活动 + 拼单 + 优惠计算 + 红包 + 积分 + 邀请
 * @author 单 Agent V2.0
 *
 * Controllers (13)：
 *   - Coupon  : CouponMerchantController / CouponPublicController / CouponAdminController
 *   - Promotion: PromotionMerchantController / PromotionPublicController / PromotionAdminController
 *   - RedPacket: RedPacketAdminController / RedPacketPublicController / RedPacketUserController
 *   - Point   : UserPointSelfController / UserPointAdminController
 *   - Invite  : InvitePublicController / InviteUserController
 *
 * Providers (9)：
 *   - CouponService / UserCouponService
 *   - PromotionService / PromotionRuleValidatorService / GroupBuyService / DiscountCalcService
 *   - RedPacketService / UserPointService / InviteRelationService
 *
 * Imports：
 *   - HealthModule（REDIS_CLIENT）
 *   - UserModule（OperationLogService）
 *   - MessageModule（领券通知 / 邀请奖励通知，UserCouponService 用 @Optional() 注入即可）
 *   - TypeOrmModule.forFeature(D7 7 实体)
 *
 * Exports：DiscountCalcService / UserCouponService / RedPacketService / UserPointService / InviteRelationService
 *          供 Sprint 3 Order pre-check / Sprint 8 Orchestration Saga 注入使用
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  Coupon,
  InviteRelation,
  Promotion,
  RedPacket,
  UserCoupon,
  UserPoint,
  UserPointFlow
} from '@/entities'
import { HealthModule } from '@/health/health.module'
import { MessageModule } from '@/modules/message/message.module'
import { UserModule } from '@/modules/user/user.module'
import { CouponAdminController } from './controllers/coupon-admin.controller'
import { CouponMerchantController } from './controllers/coupon-merchant.controller'
import { CouponPublicController } from './controllers/coupon-public.controller'
import { InvitePublicController, InviteUserController } from './controllers/invite.controller'
import { PromotionAdminController } from './controllers/promotion-admin.controller'
import { PromotionMerchantController } from './controllers/promotion-merchant.controller'
import { PromotionPublicController } from './controllers/promotion-public.controller'
import { RedPacketAdminController } from './controllers/red-packet-admin.controller'
import {
  RedPacketPublicController,
  RedPacketUserController
} from './controllers/red-packet-public.controller'
import {
  UserPointAdminController,
  UserPointSelfController
} from './controllers/user-point.controller'
import { GroupBuySagaService } from '@/modules/orchestration/services/group-buy-saga.service'
import { CouponService } from './services/coupon.service'
import { DiscountCalcService } from './services/discount-calc.service'
import { GroupBuyService } from './services/group-buy.service'
import { InviteRelationService } from './services/invite-relation.service'
import { PromotionRuleValidatorService } from './services/promotion-rule-validator.service'
import { PromotionService } from './services/promotion.service'
import { RedPacketService } from './services/red-packet.service'
import { UserCouponService } from './services/user-coupon.service'
import { UserPointService } from './services/user-point.service'

@Module({
  imports: [
    HealthModule,
    UserModule,
    MessageModule,
    TypeOrmModule.forFeature([
      Coupon,
      UserCoupon,
      Promotion,
      RedPacket,
      UserPoint,
      UserPointFlow,
      InviteRelation
    ])
  ],
  controllers: [
    CouponMerchantController,
    CouponPublicController,
    CouponAdminController,
    PromotionMerchantController,
    PromotionPublicController,
    PromotionAdminController,
    RedPacketAdminController,
    RedPacketPublicController,
    RedPacketUserController,
    UserPointSelfController,
    UserPointAdminController,
    InvitePublicController,
    InviteUserController
  ],
  providers: [
    CouponService,
    UserCouponService,
    PromotionRuleValidatorService,
    PromotionService,
    GroupBuyService,
    DiscountCalcService,
    RedPacketService,
    UserPointService,
    InviteRelationService,
    /* P9 Sprint 3 / W3.D.2：拼单成团 → 多单合并 saga（marketing 域注册；
     * 不动 OrchestrationModule；OrderService / DispatchService 通过 ModuleRef 跨模块查询） */
    GroupBuySagaService
  ],
  exports: [
    CouponService,
    UserCouponService,
    PromotionService,
    DiscountCalcService,
    RedPacketService,
    UserPointService,
    InviteRelationService
  ]
})
export class MarketingModule {}
