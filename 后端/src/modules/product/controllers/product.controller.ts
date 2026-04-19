/**
 * @file product.controller.ts
 * @stage P4/T4.4 + T4.5 + T4.7（Sprint 1）
 * @desc 商户端商品 + 商品分类接口（同一文件双 Controller，路由前缀不同）
 * @author 单 Agent V2.0
 *
 * 路由：
 *   - /merchant/product-categories → MerchantProductCategoryController
 *   - /merchant/products            → MerchantProductController
 * 鉴权：类级 @UseGuards(JwtAuthGuard, UserTypeGuard) + @UserTypes('merchant')
 */

import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { PageResult } from '@/common'
import { CurrentUser, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import { CategoryVo, CreateCategoryDto, UpdateCategoryDto } from '../dto/product-category.dto'
import { SetComboItemsDto } from '../dto/product-combo.dto'
import { SetSkuListDto } from '../dto/product-sku.dto'
import {
  CreateProductDto,
  ProductDetailVo,
  ProductVo,
  QueryProductDto,
  UpdateProductDto,
  UpdateSortDto,
  UpdateStatusDto
} from '../dto/product.dto'
import { ProductCategoryService } from '../services/product-category.service'
import { ProductService } from '../services/product.service'

@ApiTags('商户端 - 商品分类')
@ApiBearerAuth()
@Controller('merchant/product-categories')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('merchant')
export class MerchantProductCategoryController {
  constructor(private readonly categoryService: ProductCategoryService) {}

  /**
   * 新建分类
   */
  @Post()
  @ApiOperation({ summary: '商户端 - 新建商品分类（仅支持 2 级；同店铺 name 唯一）' })
  @ApiSwaggerResponse({ status: 200, type: CategoryVo })
  create(
    @CurrentUser('uid') merchantId: string,
    @Body() dto: CreateCategoryDto
  ): Promise<CategoryVo> {
    return this.categoryService.create(merchantId, dto)
  }

  /**
   * 取分类树
   */
  @Get()
  @ApiOperation({ summary: '商户端 - 取店铺商品分类树（含 children）' })
  @ApiQuery({ name: 'shopId', description: '店铺 ID（雪花字符串）', required: true })
  @ApiSwaggerResponse({ status: 200, type: CategoryVo, isArray: true })
  tree(
    @CurrentUser('uid') merchantId: string,
    @Query('shopId') shopId: string
  ): Promise<CategoryVo[]> {
    return this.categoryService.tree(merchantId, shopId)
  }

  /**
   * 编辑分类
   */
  @Put(':id')
  @ApiOperation({ summary: '商户端 - 编辑商品分类' })
  @ApiSwaggerResponse({ status: 200, type: CategoryVo })
  update(
    @CurrentUser('uid') merchantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto
  ): Promise<CategoryVo> {
    return this.categoryService.update(merchantId, id, dto)
  }

  /**
   * 删除分类（拒绝有子分类或商品引用）
   */
  @Delete(':id')
  @ApiOperation({ summary: '商户端 - 删除商品分类（软删；存在子分类或商品引用时拒绝）' })
  @ApiSwaggerResponse({ status: 200 })
  remove(@CurrentUser('uid') merchantId: string, @Param('id') id: string): Promise<{ ok: true }> {
    return this.categoryService.remove(merchantId, id)
  }
}

@ApiTags('商户端 - 商品')
@ApiBearerAuth()
@Controller('merchant/products')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('merchant')
export class MerchantProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * 新建商品（含默认 SKU 自动建 / 多规格 SKU 批量插 / 套餐子项）
   */
  @Post()
  @ApiOperation({
    summary:
      '商户端 - 新建商品（hasSku=0 自动建默认 SKU；hasSku=1 必须传 skus；productType=2 必须传 comboItems）'
  })
  @ApiSwaggerResponse({ status: 200, type: ProductDetailVo })
  create(
    @CurrentUser('uid') merchantId: string,
    @Body() dto: CreateProductDto
  ): Promise<ProductDetailVo> {
    return this.productService.create(merchantId, dto)
  }

  /**
   * 商品分页查询
   */
  @Get()
  @ApiOperation({ summary: '商户端 - 商品分页查询（按 shopId/categoryId/status/keyword）' })
  @ApiSwaggerResponse({ status: 200 })
  list(
    @CurrentUser('uid') merchantId: string,
    @Query() query: QueryProductDto
  ): Promise<PageResult<ProductVo>> {
    return this.productService.merchantList(merchantId, query)
  }

  /**
   * 商品详情
   */
  @Get(':id')
  @ApiOperation({ summary: '商户端 - 商品详情（含 SKU + 套餐子项展开）' })
  @ApiSwaggerResponse({ status: 200, type: ProductDetailVo })
  detail(
    @CurrentUser('uid') merchantId: string,
    @Param('id') id: string
  ): Promise<ProductDetailVo> {
    return this.productService.merchantDetail(merchantId, id)
  }

  /**
   * 编辑商品（基础字段；SKU/套餐请走专用接口）
   */
  @Put(':id')
  @ApiOperation({ summary: '商户端 - 编辑商品（基础字段；多规格切换会触发 SKU 校验）' })
  @ApiSwaggerResponse({ status: 200, type: ProductDetailVo })
  update(
    @CurrentUser('uid') merchantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto
  ): Promise<ProductDetailVo> {
    return this.productService.update(merchantId, id, dto)
  }

  /**
   * 批量替换 SKU 列表（事务内 hard delete + insert）
   */
  @Put(':id/skus')
  @ApiOperation({
    summary: '商户端 - 批量替换 SKU 列表（事务先删后插；多规格商品需有恰好 1 条 isDefault=1）'
  })
  @ApiSwaggerResponse({ status: 200 })
  replaceSkus(
    @CurrentUser('uid') merchantId: string,
    @Param('id') id: string,
    @Body() dto: SetSkuListDto
  ): Promise<{ count: number }> {
    return this.productService.replaceSkus(merchantId, id, dto)
  }

  /**
   * 批量替换套餐子项（仅 productType=2）
   */
  @Put(':id/combo-items')
  @ApiOperation({
    summary: '商户端 - 批量替换套餐子项（事务先删后插；仅 productType=2 允许）'
  })
  @ApiSwaggerResponse({ status: 200 })
  replaceComboItems(
    @CurrentUser('uid') merchantId: string,
    @Param('id') id: string,
    @Body() dto: SetComboItemsDto
  ): Promise<{ count: number }> {
    return this.productService.replaceComboItems(merchantId, id, dto)
  }

  /**
   * 上下架（status 0/1）
   */
  @Put(':id/status')
  @ApiOperation({ summary: '商户端 - 上下架（status 0 下架 / 1 上架）' })
  @ApiSwaggerResponse({ status: 200, type: ProductVo })
  updateStatus(
    @CurrentUser('uid') merchantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto
  ): Promise<ProductVo> {
    return this.productService.updateStatus(merchantId, id, dto)
  }

  /**
   * 调整排序
   */
  @Put(':id/sort')
  @ApiOperation({ summary: '商户端 - 调整商品排序权重（小→前）' })
  @ApiSwaggerResponse({ status: 200, type: ProductVo })
  updateSort(
    @CurrentUser('uid') merchantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSortDto
  ): Promise<ProductVo> {
    return this.productService.updateSort(merchantId, id, dto)
  }

  /**
   * 软删商品（连同 SKU 与套餐子项）
   */
  @Delete(':id')
  @ApiOperation({ summary: '商户端 - 软删商品（连同 SKU 与套餐子项一并软删）' })
  @ApiSwaggerResponse({ status: 200 })
  remove(@CurrentUser('uid') merchantId: string, @Param('id') id: string): Promise<{ ok: true }> {
    return this.productService.remove(merchantId, id)
  }
}
