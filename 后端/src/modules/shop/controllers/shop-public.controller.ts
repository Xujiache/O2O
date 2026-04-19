/**
 * @file shop-public.controller.ts
 * @stage P4/T4.3（Sprint 1）
 * @desc 用户端店铺接口：列表（GEO+排序+筛选+缓存）+ 详情
 * @author 单 Agent V2.0
 *
 * 路径前缀：/api/v1/shops
 * 鉴权：@Public()（无需登录；登录可选，不影响业务）
 */

import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiParam, ApiResponse as ApiSwaggerResponse, ApiTags } from '@nestjs/swagger'
import { type PageResult } from '@/common'
import { Public } from '@/modules/auth/decorators/public.decorator'
import { PublicShopListItemVo, PublicShopListQueryDto } from '../dto/shop-list.dto'
import { ShopService } from '../services/shop.service'

@ApiTags('用户端 - 店铺')
@Public()
@Controller('shops')
export class ShopPublicController {
  constructor(private readonly shopService: ShopService) {}

  /**
   * 用户端店铺列表（GEO + 排序 + 筛选 + 缓存）
   */
  @Get()
  @ApiOperation({
    summary: '店铺列表（按城市/距离/排序/关键字）',
    description:
      '入参：cityCode/lng/lat/keyword/industry/sort（distance|sales|score|price）+ 分页\n' +
      '缓存：shop:list:{cityCode}:{md5(params)} TTL 120s；仅展示 status=1 且 audit_status=1 的店'
  })
  @ApiSwaggerResponse({ status: 200, type: PublicShopListItemVo, isArray: true })
  list(@Query() query: PublicShopListQueryDto): Promise<PageResult<PublicShopListItemVo>> {
    return this.shopService.listForPublic(query)
  }

  /**
   * 用户端店铺详情（公开视图，无电话）
   */
  @Get(':id')
  @ApiOperation({
    summary: '店铺详情（公开）',
    description: '缓存 shop:detail:{id} TTL 300s；仅返回已审核通过且未封禁的店'
  })
  @ApiParam({ name: 'id', description: '店铺主键（雪花 ID）' })
  @ApiSwaggerResponse({ status: 200, type: PublicShopListItemVo })
  @ApiSwaggerResponse({ status: 404, description: '店铺不存在或未通过审核（10010）' })
  detail(@Param('id') id: string): Promise<PublicShopListItemVo> {
    return this.shopService.detailForPublic(id)
  }
}
