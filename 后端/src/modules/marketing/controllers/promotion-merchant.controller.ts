/**
 * @file promotion-merchant.controller.ts
 * @stage P4/T4.11（Sprint 2）
 * @desc 商户端营销活动接口：CRUD + 状态流转 + 软删
 * @author 单 Agent V2.0
 *
 * 路径前缀：/merchant/promotions（main.ts setGlobalPrefix("/api/v1")）
 * 鉴权：类级 JwtAuthGuard + UserTypeGuard + @UserTypes('merchant')
 *      service 层 assertEditable 校验 promotion.issuerType=2 && issuerId === currentUser.uid
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { type PageResult } from '@/common'
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator'
import { UserTypes } from '@/modules/auth/decorators/user-types.decorator'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { UserTypeGuard } from '@/modules/auth/guards/user-type.guard'
import {
  CreatePromotionDto,
  PromotionVo,
  QueryPromotionDto,
  UpdatePromotionDto,
  UpdatePromotionStatusDto
} from '../dto/promotion.dto'
import { PromotionService } from '../services/promotion.service'

@ApiTags('营销 - 商户活动')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('merchant')
@Controller('merchant/promotions')
export class PromotionMerchantController {
  constructor(private readonly promotionService: PromotionService) {}

  /**
   * 商户端 - 新建活动
   * issuerType=2，issuerId 自动注入 currentUser.uid
   */
  @Post()
  @ApiOperation({
    summary: '新建活动',
    description: 'rule_json 走 PromotionRuleValidator 强校验；默认 status=0 草稿'
  })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo })
  create(
    @CurrentUser('uid') merchantId: string,
    @Body() dto: CreatePromotionDto
  ): Promise<PromotionVo> {
    return this.promotionService.create(dto, 2, merchantId)
  }

  /**
   * 商户端 - 我的活动列表（按 promo_type / status / scene 筛选 + 分页）
   */
  @Get()
  @ApiOperation({ summary: '我的活动列表（分页 + 多条件筛选）' })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo, isArray: true })
  list(
    @CurrentUser('uid') merchantId: string,
    @Query() query: QueryPromotionDto
  ): Promise<PageResult<PromotionVo>> {
    return this.promotionService.listForMerchant(merchantId, query)
  }

  /**
   * 商户端 - 活动详情（owner 校验 issuerId）
   */
  @Get(':id')
  @ApiOperation({ summary: '活动详情（仅本人活动）' })
  @ApiParam({ name: 'id', description: '活动主键（雪花 ID）' })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo })
  @ApiSwaggerResponse({ status: 403, description: '非本人活动（20003）' })
  detail(@Param('id') id: string, @CurrentUser('uid') merchantId: string): Promise<PromotionVo> {
    return this.promotionService.detail(id, { issuerType: 2, issuerId: merchantId })
  }

  /**
   * 商户端 - 编辑活动
   * 约束：used_qty>0 时仅允许改 status / description
   */
  @Put(':id')
  @ApiOperation({
    summary: '编辑活动',
    description: 'used_qty>0 时仅允许改 status/description；其余字段抛 BIZ_OPERATION_FORBIDDEN'
  })
  @ApiParam({ name: 'id', description: '活动主键' })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo })
  update(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: UpdatePromotionDto
  ): Promise<PromotionVo> {
    return this.promotionService.update(id, dto, { issuerType: 2, issuerId: merchantId })
  }

  /**
   * 商户端 - 状态流转（0 草稿 / 1 启用 / 2 暂停 / 3 已结束）
   */
  @Put(':id/status')
  @ApiOperation({
    summary: '状态流转',
    description: '矩阵：0→1/3；1↔2；1/2→3；3 终态不可逆'
  })
  @ApiParam({ name: 'id', description: '活动主键' })
  @ApiSwaggerResponse({ status: 200, type: PromotionVo })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: UpdatePromotionStatusDto
  ): Promise<PromotionVo> {
    return this.promotionService.updateStatus(id, dto, {
      issuerType: 2,
      issuerId: merchantId
    })
  }

  /**
   * 商户端 - 软删活动（used_qty>0 → 拒绝）
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软删活动（used_qty>0 拒绝）' })
  @ApiParam({ name: 'id', description: '活动主键' })
  async softDelete(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string
  ): Promise<{ ok: true }> {
    await this.promotionService.softDelete(id, { issuerType: 2, issuerId: merchantId })
    return { ok: true }
  }
}
