/**
 * @file coupon-merchant.controller.ts
 * @stage P4/T4.9（Sprint 2）
 * @desc 商户端优惠券接口：店铺券模板 CRUD + 上下架 + 软删
 * @author 单 Agent V2.0
 *
 * 路径前缀：/api/v1/merchant/coupons（main.ts setGlobalPrefix("/api/v1")）
 * 鉴权：类级 JwtAuthGuard + UserTypeGuard + @UserTypes('merchant')
 *      所有 :id 接口在 service 层 assertOwner 校验 issuerType=2 && issuerId === currentUser.uid
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
import { CurrentUser, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import {
  CouponVo,
  CreateCouponDto,
  QueryCouponDto,
  UpdateCouponDto,
  UpdateCouponStatusDto
} from '../dto/coupon.dto'
import { CouponService } from '../services/coupon.service'

@ApiTags('营销 - 优惠券（商户端）')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('merchant')
@Controller('merchant/coupons')
export class CouponMerchantController {
  constructor(private readonly couponService: CouponService) {}

  /**
   * 新建店铺券（issuerType=2 / issuerId=currentUser.uid）
   */
  @Post()
  @ApiOperation({
    summary: '新建店铺券',
    description: 'issuerType 固定为 2；issuerId 取自当前登录商户 uid，不允许从 body 传入'
  })
  @ApiSwaggerResponse({ status: 200, type: CouponVo })
  create(@CurrentUser('uid') merchantId: string, @Body() dto: CreateCouponDto): Promise<CouponVo> {
    return this.couponService.merchantCreate(merchantId, dto)
  }

  /**
   * 我的券模板列表（按 status / coupon_type / scene / name 筛选）
   */
  @Get()
  @ApiOperation({ summary: '我的券模板列表（分页 + 筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  list(
    @CurrentUser('uid') merchantId: string,
    @Query() query: QueryCouponDto
  ): Promise<PageResult<CouponVo>> {
    return this.couponService.merchantList(merchantId, query)
  }

  /**
   * 券模板详情（仅本人券）
   */
  @Get(':id')
  @ApiOperation({ summary: '券模板详情（仅本人券）' })
  @ApiParam({ name: 'id', description: '券模板主键（雪花字符串）' })
  @ApiSwaggerResponse({ status: 200, type: CouponVo })
  @ApiSwaggerResponse({ status: 403, description: '非本人券（20003）' })
  detail(@Param('id') id: string, @CurrentUser('uid') merchantId: string): Promise<CouponVo> {
    return this.couponService.merchantDetail(id, merchantId)
  }

  /**
   * 编辑券模板
   * 注：已发出（receivedQty>0）→ 仅允许改 name / description / imageUrl / status
   */
  @Put(':id')
  @ApiOperation({
    summary: '编辑券模板',
    description: '已发出（receivedQty>0）的券，仅允许改 name / description / imageUrl / status'
  })
  @ApiParam({ name: 'id', description: '券模板主键' })
  @ApiSwaggerResponse({ status: 200, type: CouponVo })
  @ApiSwaggerResponse({ status: 200, description: '已发出 → 修改受限字段抛 10012' })
  update(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: UpdateCouponDto
  ): Promise<CouponVo> {
    return this.couponService.merchantUpdate(id, merchantId, dto)
  }

  /**
   * 上下架 / 停用（status 0/1/2）
   */
  @Put(':id/status')
  @ApiOperation({ summary: '切换券模板状态（0 停用 / 1 启用 / 2 已下架）' })
  @ApiParam({ name: 'id', description: '券模板主键' })
  @ApiSwaggerResponse({ status: 200, type: CouponVo })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: UpdateCouponStatusDto
  ): Promise<CouponVo> {
    return this.couponService.merchantUpdateStatus(id, merchantId, dto)
  }

  /**
   * 软删（必须先下架；已发出拒绝）
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '软删除券模板',
    description: '前置：status=2 已下架 + receivedQty=0；不满足任一条件抛 10012'
  })
  @ApiParam({ name: 'id', description: '券模板主键' })
  @ApiSwaggerResponse({ status: 200 })
  async remove(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string
  ): Promise<{ deleted: boolean }> {
    await this.couponService.merchantDelete(id, merchantId)
    return { deleted: true }
  }
}
