/**
 * @file coupon-public.controller.ts
 * @stage P4/T4.10（Sprint 2）
 * @desc 用户端优惠券接口：可领列表（公开） + 主动领取 + 我的券 + 最优券推荐
 * @author 单 Agent V2.0
 *
 * 路径前缀：/api/v1（main.ts setGlobalPrefix）
 * 鉴权：
 *   - GET /coupons/available 走 @Public 不鉴权
 *   - 其余 @UseGuards(JwtAuthGuard, UserTypeGuard) + @UserTypes('user')
 *
 * 注：本 Controller 同时承载 /coupons/* 与 /me/coupons/* 两个前缀，因 Sprint 2 仅 1 个用户端
 *      Controller 上限；为避免类级 prefix 冲突，类级 @Controller() 不带 prefix，方法 @Get/@Post
 *      显式带完整路径。
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { type PageResult } from '@/common'
import { CurrentUser, Public, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import { AvailableCouponQueryDto, CouponVo } from '../dto/coupon.dto'
import {
  BestMatchQueryDto,
  BestMatchUserCouponVo,
  QueryUserCouponDto,
  UserCouponVo
} from '../dto/user-coupon.dto'
import { CouponService } from '../services/coupon.service'
import { UserCouponService } from '../services/user-coupon.service'

@ApiTags('营销 - 优惠券（用户端）')
@Controller()
export class CouponPublicController {
  constructor(
    private readonly couponService: CouponService,
    private readonly userCouponService: UserCouponService
  ) {}

  /* ==========================================================================
   * 公开接口（@Public 不鉴权）
   * ========================================================================== */

  /**
   * 可领券列表（仅 status=1 + 未达 totalQty + 在生效时段；按 cityCode/scene/shopId 筛选）
   */
  @Public()
  @Get('coupons/available')
  @ApiOperation({
    summary: '可领券列表（公开）',
    description: '入参 cityCode / scene / shopId 可选；仅返回 status=1 且 totalQty 未达上限的券'
  })
  @ApiSwaggerResponse({ status: 200 })
  available(@Query() query: AvailableCouponQueryDto): Promise<PageResult<CouponVo>> {
    return this.couponService.publicAvailableList(query)
  }

  /* ==========================================================================
   * 用户端鉴权接口（@UserTypes('user')）
   * ========================================================================== */

  /**
   * 主动领取一张优惠券（receivedSource=1）
   *
   * 业务约束（V4.7 验收）：
   *   - per_user_limit：单用户对单券达上限抛 10012
   *   - 总量：total_qty>0 且 received_qty>=total_qty 抛 10012 已领完
   *   - 限流：3s/次/(userId, couponId) 抛 30001 RATE_LIMIT_EXCEEDED
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('user')
  @Post('coupons/:id/receive')
  @ApiOperation({
    summary: '用户主动领取优惠券',
    description:
      '事务内 SELECT FOR UPDATE coupon → check 总量/per_user_limit → INSERT user_coupon + receivedQty++'
  })
  @ApiParam({ name: 'id', description: '券模板主键（雪花字符串）' })
  @ApiSwaggerResponse({ status: 200, type: UserCouponVo })
  @ApiSwaggerResponse({ status: 200, description: '达到限领上限 / 已领完 → 10012；限流 → 30001' })
  receive(
    @Param('id') couponId: string,
    @CurrentUser('uid') userId: string
  ): Promise<UserCouponVo> {
    return this.userCouponService.receive(userId, couponId)
  }

  /**
   * 我的券列表（按 status 筛选；ORDER BY status ASC, valid_to ASC）
   *
   * 缓存：默认查询（status undefined, page=1, pageSize=20）走 coupon:user:{userId} TTL 60s
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('user')
  @Get('me/coupons')
  @ApiOperation({
    summary: '我的券列表',
    description: '默认查询走 60s 缓存；带 status / 翻页 直查 DB'
  })
  @ApiSwaggerResponse({ status: 200 })
  myList(
    @CurrentUser('uid') userId: string,
    @Query() query: QueryUserCouponDto
  ): Promise<PageResult<UserCouponVo>> {
    return this.userCouponService.list(userId, query)
  }

  /**
   * 下单时推荐"最优可用券"
   *
   * 入参 orderType / shopId / totalAmount；返回单张抵扣最大的 user_coupon（无可用 → null）
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('user')
  @Get('me/coupons/best-match')
  @ApiOperation({
    summary: '下单时推荐"最优可用券"',
    description:
      '过滤 scene/applicable_shops/minOrderAmount → BigNumber 算单张抵扣最大；并列时 valid_to 临近优先'
  })
  @ApiSwaggerResponse({ status: 200, type: BestMatchUserCouponVo })
  bestMatch(
    @CurrentUser('uid') userId: string,
    @Query() query: BestMatchQueryDto
  ): Promise<BestMatchUserCouponVo | null> {
    return this.userCouponService.bestMatch(userId, query)
  }
}
