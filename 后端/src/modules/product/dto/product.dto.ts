/**
 * @file product.dto.ts
 * @stage P4/T4.5 + T4.7（Sprint 1）
 * @desc 商品 DTO：创建/更新/查询/详情/列表/上下架/排序；price 一律 string + IsDecimal
 * @author 单 Agent V2.0
 *
 * 关键约束（与 P4 设计一致）：
 *   - hasSku=0 单规格：service 自动建一条 is_default=1 SKU，price = product.price
 *   - hasSku=1 多规格：必须随 dto 传入 skus[]（至少 1 条）
 *   - product_type=2 套餐：必须随 dto 传入 comboItems[]（至少 1 条）
 *   - stock_qty 仅写入 SKU 列；不在本期实现 Redis 原子扣减
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsDecimal,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator'
import { PageQueryDto } from '@/common'
import { ComboItemDto, ComboItemVo } from './product-combo.dto'
import { SkuItemDto, SkuVo } from './product-sku.dto'

/**
 * 创建商品入参（商户端）
 * 用途：POST /merchant/products
 */
export class CreateProductDto {
  @ApiProperty({ description: '所属店铺 ID（雪花字符串）', example: '180000000000000001' })
  @IsNumberString({ no_symbols: true }, { message: 'shopId 必须为雪花数字字符串' })
  @Length(1, 32)
  shopId!: string

  @ApiProperty({ description: '所属分类 ID（雪花字符串）', example: '180000000000000002' })
  @IsNumberString({ no_symbols: true }, { message: 'categoryId 必须为雪花数字字符串' })
  @Length(1, 32)
  categoryId!: string

  @ApiProperty({ description: '商品名称', example: '红烧牛肉面' })
  @IsString()
  @Length(1, 128)
  name!: string

  @ApiPropertyOptional({ description: '简介（一句话卖点）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  brief?: string

  @ApiPropertyOptional({ description: '详细描述（富文本）' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({ description: '主图 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  mainImageUrl?: string

  @ApiPropertyOptional({ description: '商品图片数组（最多 8 张）', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8, { message: '商品图片最多 8 张' })
  @IsString({ each: true })
  imageUrls?: string[]

  @ApiProperty({
    description: '默认价格（小数 2 位字符串；hasSku=0 时即售价；hasSku=1 时为最低价冗余）',
    example: '15.80'
  })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'price 必须为最多 2 位小数的字符串' })
  price!: string

  @ApiPropertyOptional({ description: '划线原价（小数 2 位字符串）' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'originalPrice 必须为最多 2 位小数的字符串' })
  originalPrice?: string

  @ApiPropertyOptional({ description: '商品级打包费（小数 2 位字符串，覆盖店铺默认）' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'packagingFee 必须为最多 2 位小数的字符串' })
  packagingFee?: string

  @ApiPropertyOptional({ description: '起购数量', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minOrderQty?: number

  @ApiPropertyOptional({ description: '单笔限购（0=不限）', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limitPerOrder?: number

  @ApiProperty({ description: '是否多规格：0 单规格 / 1 多规格', example: 0 })
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  hasSku!: number

  @ApiPropertyOptional({ description: '商品类型：1 普通 / 2 套餐 / 3 特价', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  productType?: number

  @ApiPropertyOptional({
    description: '标签数组（例：["招牌","辣"]，最多 10 个）',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: '标签最多 10 个' })
  @IsString({ each: true })
  tags?: string[]

  @ApiPropertyOptional({ description: '是否推荐：0 否 / 1 是', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isRecommend?: number

  @ApiPropertyOptional({ description: '是否新品：0 否 / 1 是', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isNew?: number

  @ApiPropertyOptional({ description: '排序权重（小→前）', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number

  @ApiPropertyOptional({
    description:
      'SKU 列表；hasSku=1 时必传（至少 1 条）；hasSku=0 时忽略，由 service 自动建默认 SKU',
    type: () => [SkuItemDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkuItemDto)
  skus?: SkuItemDto[]

  @ApiPropertyOptional({
    description: '套餐子项；productType=2 时必传（至少 1 条）',
    type: () => [ComboItemDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboItemDto)
  comboItems?: ComboItemDto[]
}

/**
 * 更新商品入参（商户端）
 * 用途：PUT /merchant/products/:id；SKU 与套餐子项请走专用接口替换
 */
export class UpdateProductDto {
  @ApiPropertyOptional({ description: '所属分类 ID' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  categoryId?: string

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 128) name?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) brief?: string
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) mainImageUrl?: string

  @ApiPropertyOptional({ description: '商品图片数组（最多 8 张）', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  imageUrls?: string[]

  @ApiPropertyOptional({ description: '默认价格（小数 2 位字符串）' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'price 必须为最多 2 位小数的字符串' })
  price?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'originalPrice 必须为最多 2 位小数的字符串' })
  originalPrice?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'packagingFee 必须为最多 2 位小数的字符串' })
  packagingFee?: string

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) minOrderQty?: number
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) limitPerOrder?: number

  @ApiPropertyOptional({
    description: '切换是否多规格：0 单规格 / 1 多规格；0→1 校验 SKU 数 ≥ 1，1→0 仅保留 isDefault=1'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  hasSku?: number

  @ApiPropertyOptional({ description: '商品类型：1 普通 / 2 套餐 / 3 特价' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  productType?: number

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[]

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isRecommend?: number
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1]) isNew?: number
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) sort?: number
}

/**
 * 商品分页查询入参（商户端）
 * 用途：GET /merchant/products
 */
export class QueryProductDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '所属店铺 ID（不传则查当前商户名下全部店铺）' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  shopId?: string

  @ApiPropertyOptional({ description: '所属分类 ID' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  categoryId?: string

  @ApiPropertyOptional({ description: '上架状态：0 下架 / 1 上架 / 2 售罄' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  status?: number

  @ApiPropertyOptional({ description: '商品名称模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  keyword?: string
}

/**
 * 管理后台商品分页查询入参
 * 用途：GET /admin/products
 */
export class AdminQueryProductDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '所属店铺 ID' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  shopId?: string

  @ApiPropertyOptional({ description: '审核状态：0 待审 / 1 通过 / 2 驳回' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  auditStatus?: number

  @ApiPropertyOptional({ description: '上架状态：0 下架 / 1 上架 / 2 售罄' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  status?: number

  @ApiPropertyOptional({ description: '商品名称模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  keyword?: string
}

/**
 * 上架/下架入参
 * 用途：PUT /merchant/products/:id/status
 */
export class UpdateStatusDto {
  @ApiProperty({ description: '上架状态：0 下架 / 1 上架', example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1], { message: '商户端只能切换上架/下架，售罄由系统自动设置' })
  status!: number
}

/**
 * 调整排序入参
 * 用途：PUT /merchant/products/:id/sort
 */
export class UpdateSortDto {
  @ApiProperty({ description: '排序权重（小→前）', example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort!: number
}

/**
 * 强制下架入参（管理端）
 * 用途：POST /admin/products/:id/force-off
 */
export class ForceOffDto {
  @ApiProperty({ description: '强制下架原因（必填，写入 audit_remark + OperationLog）' })
  @IsString()
  @Length(2, 255)
  remark!: string
}

/**
 * 商品视图（列表）
 */
export class ProductVo {
  @ApiProperty() id!: string
  @ApiProperty() shopId!: string
  @ApiProperty() categoryId!: string
  @ApiProperty() name!: string
  @ApiProperty({ nullable: true }) brief!: string | null
  @ApiProperty({ nullable: true }) mainImageUrl!: string | null
  @ApiProperty({ description: '默认价格（字符串）' }) price!: string
  @ApiProperty({ description: '划线原价', nullable: true }) originalPrice!: string | null
  @ApiProperty({ description: '商品级打包费' }) packagingFee!: string
  @ApiProperty({ description: '起购数量' }) minOrderQty!: number
  @ApiProperty({ description: '单笔限购' }) limitPerOrder!: number
  @ApiProperty({ description: '是否多规格' }) hasSku!: number
  @ApiProperty({ description: '商品类型：1 普通 / 2 套餐 / 3 特价' }) productType!: number
  @ApiProperty({ description: '标签', nullable: true }) tags!: string[] | null
  @ApiProperty({ description: '月销量' }) monthlySales!: number
  @ApiProperty({ description: '累计销量' }) totalSales!: number
  @ApiProperty({ description: '商品评分' }) score!: number
  @ApiProperty({ description: '评分人数' }) scoreCount!: number
  @ApiProperty({ description: '是否推荐' }) isRecommend!: number
  @ApiProperty({ description: '是否新品' }) isNew!: number
  @ApiProperty({ description: '审核状态：0 待审 / 1 通过 / 2 驳回' }) auditStatus!: number
  @ApiProperty({ description: '上架状态：0 下架 / 1 上架 / 2 售罄' }) status!: number
  @ApiProperty({ description: '排序权重' }) sort!: number
  @ApiProperty() createdAt!: Date
  @ApiProperty() updatedAt!: Date
}

/**
 * 商品详情视图（包含图片数组、SKU 列表与套餐子项展开）
 */
export class ProductDetailVo extends ProductVo {
  @ApiProperty({ description: '商品图片数组', type: [String], nullable: true })
  imageUrls!: string[] | null

  @ApiProperty({ description: '详细描述', nullable: true })
  description!: string | null

  @ApiProperty({ description: '审核备注', nullable: true })
  auditRemark!: string | null

  @ApiProperty({ description: 'SKU 列表（按 isDefault desc, id asc）', type: () => [SkuVo] })
  skus!: SkuVo[]

  @ApiProperty({
    description: '套餐子项（仅 productType=2 时非空）',
    type: () => [ComboItemVo]
  })
  comboItems!: ComboItemVo[]
}

/**
 * 用户端店铺商品分组视图（按分类聚合）
 * 用途：GET /shops/:shopId/products
 */
export class ShopProductGroupVo {
  @ApiProperty({ description: '分类 ID' }) categoryId!: string
  @ApiProperty({ description: '分类名称' }) categoryName!: string
  @ApiProperty({ description: '分类排序权重' }) categorySort!: number
  @ApiProperty({ description: '该分类下商品列表', type: () => [ProductVo] })
  products!: ProductVo[]
}
