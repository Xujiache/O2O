/**
 * @file shop.controller.ts
 * @stage P4/T4.1 + T4.2（Sprint 1）
 * @desc 商户端店铺接口：CRUD + 营业时段 + 配送范围 + 公告 + 自动接单 + 营业状态
 * @author 单 Agent V2.0
 *
 * 路径前缀：/api/v1/merchant/shop（main.ts setGlobalPrefix("/api/v1")）
 * 鉴权：类级 JwtAuthGuard + UserTypeGuard + @UserTypes('merchant')
 *      所有 :id 接口在 service 层 assertOwner 校验 shop.merchantId === currentUser.uid
 */

import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
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
import { BusinessHourVo, SetBusinessHoursDto } from '../dto/business-hour.dto'
import { DeliveryAreaVo, SetDeliveryAreaDto } from '../dto/delivery-area.dto'
import {
  CreateShopDto,
  QueryShopDto,
  SetAnnouncementDto,
  SetAutoAcceptDto,
  SetBusinessStatusDto,
  ShopVo,
  UpdateShopDto
} from '../dto/shop.dto'
import { DeliveryAreaService } from '../services/delivery-area.service'
import { ShopBusinessHourService } from '../services/shop-business-hour.service'
import { ShopService } from '../services/shop.service'

@ApiTags('商户中心 - 店铺')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('merchant')
@Controller('merchant/shop')
export class ShopController {
  constructor(
    private readonly shopService: ShopService,
    private readonly businessHourService: ShopBusinessHourService,
    private readonly deliveryAreaService: DeliveryAreaService
  ) {}

  /**
   * 创建店铺（默认 audit_status=0 待审；business_status=0）
   */
  @Post()
  @ApiOperation({
    summary: '创建店铺',
    description: '商户号绑定 currentUser.uid；audit_status=0 待审；business_status=0 打烊'
  })
  @ApiSwaggerResponse({ status: 200, type: ShopVo })
  create(@CurrentUser('uid') merchantId: string, @Body() dto: CreateShopDto): Promise<ShopVo> {
    return this.shopService.create(merchantId, dto)
  }

  /**
   * 当前商户名下店铺列表
   */
  @Get()
  @ApiOperation({ summary: '当前商户名下店铺列表（分页）' })
  list(
    @CurrentUser('uid') merchantId: string,
    @Query() query: QueryShopDto
  ): Promise<PageResult<ShopVo>> {
    return this.shopService.listForMerchant(merchantId, query)
  }

  /**
   * 店铺详情（必须为本人店铺）
   */
  @Get(':id')
  @ApiOperation({ summary: '店铺详情（仅本人店铺）' })
  @ApiParam({ name: 'id', description: '店铺主键（雪花 ID）' })
  @ApiSwaggerResponse({ status: 200, type: ShopVo })
  @ApiSwaggerResponse({ status: 403, description: '非本人店铺（20003）' })
  detail(@Param('id') id: string, @CurrentUser('uid') merchantId: string): Promise<ShopVo> {
    return this.shopService.detailForMerchant(id, merchantId)
  }

  /**
   * 编辑店铺（命中敏感字段触发重审：audit_status→0）
   */
  @Put(':id')
  @ApiOperation({
    summary: '编辑店铺',
    description:
      '命中敏感字段（name/address/lng/lat/contactMobile/industryCode）→ audit_status 重置 0'
  })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: ShopVo })
  update(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: UpdateShopDto
  ): Promise<ShopVo> {
    return this.shopService.update(id, merchantId, dto)
  }

  /**
   * 批量设置营业时段（先删后插事务）
   */
  @Put(':id/business-hours')
  @ApiOperation({ summary: '批量设置营业时段（先删后插事务）' })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: BusinessHourVo, isArray: true })
  async setBusinessHours(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: SetBusinessHoursDto
  ): Promise<BusinessHourVo[]> {
    /* 先校验归属（service 层会再校验一次），避免无关用户随意删别人时段 */
    await this.shopService.assertOwner(id, merchantId)
    const result = await this.businessHourService.setForShop(id, dto)
    /* 营业时段变更后，列表 isOpenNow 可能变化 → 失效列表/详情缓存 */
    const shop = await this.shopService.findActiveById(id)
    await this.shopService.invalidateDetailCache(id)
    await this.shopService.invalidateListCache(shop.cityCode)
    return result
  }

  /**
   * 查询店铺营业时段
   */
  @Get(':id/business-hours')
  @ApiOperation({ summary: '查询店铺营业时段' })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: BusinessHourVo, isArray: true })
  async listBusinessHours(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string
  ): Promise<BusinessHourVo[]> {
    await this.shopService.assertOwner(id, merchantId)
    return this.businessHourService.listByShop(id)
  }

  /**
   * 切换自动接单开关
   */
  @Put(':id/auto-accept')
  @ApiOperation({ summary: '切换自动接单（0 关 / 1 开）' })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: ShopVo })
  setAutoAccept(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: SetAutoAcceptDto
  ): Promise<ShopVo> {
    return this.shopService.setAutoAccept(id, merchantId, dto)
  }

  /**
   * 设置店铺公告
   */
  @Put(':id/announcement')
  @ApiOperation({ summary: '设置店铺公告（≤500 字）' })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: ShopVo })
  setAnnouncement(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: SetAnnouncementDto
  ): Promise<ShopVo> {
    return this.shopService.setAnnouncement(id, merchantId, dto)
  }

  /**
   * 切换营业状态（0 打烊 / 1 营业中 / 2 临时歇业）
   */
  @Put(':id/business-status')
  @ApiOperation({ summary: '切换营业状态（0 打烊 / 1 营业中 / 2 临时歇业）' })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: ShopVo })
  setBusinessStatus(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: SetBusinessStatusDto
  ): Promise<ShopVo> {
    return this.shopService.setBusinessStatus(id, merchantId, dto)
  }

  /**
   * 设置配送范围 polygon（写 delivery_area.area_type=1 + MapService 缓存预热）
   */
  @Put(':id/delivery-area')
  @ApiOperation({
    summary: '设置配送范围 polygon',
    description:
      '写 delivery_area(area_type=1, owner_id=:id) + 调 MapService.setShopArea 写 5min Redis 缓存'
  })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: DeliveryAreaVo })
  async setDeliveryArea(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: SetDeliveryAreaDto
  ): Promise<DeliveryAreaVo> {
    const shop = await this.shopService.assertOwner(id, merchantId)
    return this.deliveryAreaService.setForShop(id, dto, shop.name)
  }

  /**
   * 查询当前生效的配送范围
   */
  @Get(':id/delivery-area')
  @ApiOperation({ summary: '查询当前生效的配送范围' })
  @ApiParam({ name: 'id', description: '店铺主键' })
  @ApiSwaggerResponse({ status: 200, type: DeliveryAreaVo })
  async getDeliveryArea(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string
  ): Promise<DeliveryAreaVo | null> {
    await this.shopService.assertOwner(id, merchantId)
    return this.deliveryAreaService.getForShop(id)
  }
}
