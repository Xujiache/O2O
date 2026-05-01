/**
 * @file search.controller.ts
 * @stage P9 Sprint 6 / W6.E.1
 * @desc 用户端搜索：商品 LIKE 模糊 + 跑腿模板字典匹配
 * @author 单 Agent V2.0（Sprint 6 Agent E）
 *
 * 路径：
 *   - POST /api/v1/search/products            商品 LIKE
 *   - POST /api/v1/search/errand-templates    跑腿模板（4 类 service_type）
 *
 * 鉴权：@Public —— 与 ShopPublicController 一致，不强制登录即可搜索；
 *      用户登录态由前端 request 拦截器透传，service 内不依赖 uid。
 */

import { Body, Controller, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse as ApiSwaggerResponse, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator'
import { type PageResult } from '@/common'
import { Public } from '@/modules/auth/decorators'
import {
  type SearchErrandTemplateItemVo,
  type SearchProductItemVo,
  ShopService
} from '../services/shop.service'

/**
 * 商品搜索入参
 */
export class SearchProductsDto {
  @IsString()
  @MaxLength(64)
  keyword!: string

  @IsOptional()
  @IsString()
  @Length(2, 8)
  cityCode?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20
}

/**
 * 跑腿模板搜索入参
 */
export class SearchErrandTemplatesDto {
  @IsString()
  @MaxLength(64)
  keyword!: string
}

/**
 * 搜索控制器
 */
@ApiTags('搜索 - 用户端')
@Controller()
export class SearchController {
  constructor(private readonly shopService: ShopService) {}

  /**
   * 商品搜索
   * 路径：POST /search/products
   */
  @Public()
  @Post('search/products')
  @ApiOperation({
    summary: '商品搜索（LIKE name/brief；仅展示已上架 + 审核通过 + 店铺正常营业）'
  })
  @ApiSwaggerResponse({ status: 200 })
  searchProducts(@Body() dto: SearchProductsDto): Promise<PageResult<SearchProductItemVo>> {
    return this.shopService.searchProducts({
      keyword: dto.keyword,
      cityCode: dto.cityCode,
      page: dto.page,
      pageSize: dto.pageSize
    })
  }

  /**
   * 跑腿模板搜索（service_type 字典）
   * 路径：POST /search/errand-templates
   */
  @Public()
  @Post('search/errand-templates')
  @ApiOperation({
    summary: '跑腿模板搜索（service_type 1-4 字典；按 keyword 内存匹配 name/desc/tags）'
  })
  @ApiSwaggerResponse({ status: 200 })
  searchErrandTemplates(
    @Body() dto: SearchErrandTemplatesDto
  ): Promise<{ list: SearchErrandTemplateItemVo[]; total: number }> {
    return this.shopService.searchErrandTemplates({ keyword: dto.keyword })
  }
}
