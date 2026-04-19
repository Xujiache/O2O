/**
 * @file promotion-public.controller.ts
 * @stage P4/T4.11 + T4.13（Sprint 2）
 * @desc 用户端营销接口：店铺活动列表（公开）+ 加入拼单 + 我的拼单 + 优惠预览
 * @author 单 Agent V2.0
 *
 * 4 个接口路径不共享前缀（@Controller 留空，路径走方法级 @Get/@Post）：
 *   1. GET  /shops/:shopId/promotions       @Public()
 *   2. POST /promotions/:id/join-group      @UserTypes('user')
 *   3. GET  /me/group-buys                  @UserTypes('user')
 *   4. POST /me/discount-preview            @UserTypes('user')
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator'
import { Public } from '@/modules/auth/decorators/public.decorator'
import { UserTypes } from '@/modules/auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '@/modules/auth/guards/user-type.guard'
import { DiscountCalcContextDto, DiscountCalcResultDto } from '../dto/discount-calc.dto'
import { GroupBuyVo, JoinGroupDto, QueryMyGroupBuyDto } from '../dto/group-buy.dto'
import { PromotionVo, QueryShopPromotionDto } from '../dto/promotion.dto'
import { DiscountCalcService } from '../services/discount-calc.service'
import { GroupBuyService } from '../services/group-buy.service'
import { PromotionService } from '../services/promotion.service'

@ApiTags('营销 - 用户端')
@Controller()
export class PromotionPublicController {
  constructor(
    private readonly promotionService: PromotionService,
    private readonly groupBuyService: GroupBuyService,
    private readonly discountCalcService: DiscountCalcService
  ) {}

  /**
   * [Public] 店铺当前进行中活动列表（缓存 60s）
   */
  @Public()
  @Get('shops/:shopId/promotions')
  @ApiOperation({
    summary: '店铺活动列表（公开）',
    description: '仅返回 status=1 + 当前在 valid 时段内 + scene 匹配的活动；缓存 60s'
  })
  @ApiParam({ name: 'shopId', description: '店铺主键（雪花 ID）' })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo, isArray: true })
  listForShop(
    @Param('shopId') shopId: string,
    @Query() query: QueryShopPromotionDto
  ): Promise<PromotionVo[]> {
    return this.promotionService.listForPublic(shopId, query)
  }

  /**
   * [User] 加入拼单
   *   - promo_type=3 校验 + status=1 + 时段
   *   - Redis Set 计数 SADD/SCARD；满人触发成团事件（本期 log）
   *   - 不传 groupNo 服务端自动开新团；传则加入既有团
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('user')
  @Post('promotions/:id/join-group')
  @ApiOperation({
    summary: '加入拼单（promo_type=3）',
    description: 'Redis Set 计数 + 超时 EXPIRE；不传 groupNo 服务端自动开新团；满员标记 success'
  })
  @ApiParam({ name: 'id', description: '活动主键' })
  @ApiSwaggerResponse({ status: 200, type: GroupBuyVo })
  joinGroup(
    @Param('id') promotionId: string,
    @CurrentUser('uid') userId: string,
    @Body() dto: JoinGroupDto
  ): Promise<GroupBuyVo> {
    return this.groupBuyService.joinGroup(promotionId, userId, dto.groupNo)
  }

  /**
   * [User] 我参与的拼单
   *   - 状态过滤（pending/success/failed），不传 = 全部
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('user')
  @Get('me/group-buys')
  @ApiOperation({
    summary: '我参与的拼单（按 status 过滤）',
    description: 'Redis 用户索引 Set（TTL 7 天）+ 元数据 Hash 还原状态'
  })
  @ApiSwaggerResponse({ status: 200, type: GroupBuyVo, isArray: true })
  myGroups(
    @CurrentUser('uid') userId: string,
    @Query() query: QueryMyGroupBuyDto
  ): Promise<GroupBuyVo[]> {
    return this.groupBuyService.listMyGroupBuys(userId, query)
  }

  /**
   * [User] 下单前优惠计算预览（DiscountCalc.calc(ctx)）
   *   - userId 由 controller 自动注入；前端传入的 userId 字段会被覆盖
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes('user')
  @Post('me/discount-preview')
  @ApiOperation({
    summary: '下单前优惠计算预览',
    description:
      '互斥规则：1 张优惠券 + 1 个非 stackable 活动 + 多个 stackable 活动；最低支付 0.01 元'
  })
  @ApiSwaggerResponse({ status: 200, type: DiscountCalcResultDto })
  preview(
    @CurrentUser('uid') userId: string,
    @Body() dto: DiscountCalcContextDto
  ): Promise<DiscountCalcResultDto> {
    /* 强制覆盖 userId（防止用户传 userId 越权计算他人 user_coupon） */
    return this.discountCalcService.calc({ ...dto, userId })
  }
}
