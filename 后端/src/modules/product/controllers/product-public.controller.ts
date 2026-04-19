/**
 * @file product-public.controller.ts
 * @stage P4/T4.5 + T4.7（Sprint 1）
 * @desc 用户端商品公开接口（@Public 不鉴权）
 * @author 单 Agent V2.0
 *
 * 路由：
 *   - GET /shops/:shopId/products       店铺商品列表（按分类分组）
 *   - GET /products/:id                 商品详情（售罄/下架仍可查）
 */

import { Controller, Get, Param } from '@nestjs/common'
import { ApiOperation, ApiResponse as ApiSwaggerResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '@/modules/auth/decorators'
import { ProductDetailVo, ShopProductGroupVo } from '../dto/product.dto'
import { ProductService } from '../services/product.service'

@ApiTags('用户端 - 商品')
@Controller()
export class ProductPublicController {
  constructor(private readonly productService: ProductService) {}

  /**
   * 用户端：店铺商品列表（按分类分组；仅店铺营业中 + 商品 status=1 + audit_status=1 可见）
   */
  @Public()
  @Get('shops/:shopId/products')
  @ApiOperation({
    summary: '用户端 - 店铺商品列表（按分类分组；店铺打烊/封禁拒绝；仅上架商品可见）'
  })
  @ApiSwaggerResponse({ status: 200, type: ShopProductGroupVo, isArray: true })
  listByShop(@Param('shopId') shopId: string): Promise<ShopProductGroupVo[]> {
    return this.productService.publicListByShop(shopId)
  }

  /**
   * 用户端：商品详情（售罄/下架仍可查；返回 status 字段供前端判断）
   */
  @Public()
  @Get('products/:id')
  @ApiOperation({
    summary: '用户端 - 商品详情（含 SKU + 套餐子项展开；售罄/下架仍可查，软删拒绝）'
  })
  @ApiSwaggerResponse({ status: 200, type: ProductDetailVo })
  detail(@Param('id') id: string): Promise<ProductDetailVo> {
    return this.productService.publicDetail(id)
  }
}
