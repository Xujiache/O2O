/**
 * @file product-sku.dto.ts
 * @stage P4/T4.5（Sprint 1）
 * @desc 商品 SKU DTO：批量替换（先删后插）+ 单条 VO；price 一律 string + IsDecimal
 * @author 单 Agent V2.0
 *
 * 注：本期不实现 Redis 原子扣减（由 Agent C 的 inventory.service 接管），仅写入 stock_qty 列；
 *     单规格商品默认 stock_qty=-1（无限库存）
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDecimal,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator'
import type { SkuSpecItem } from '@/entities'

/**
 * 规格组合项 DTO（spec_json 内嵌结构）
 * 用途：嵌入 SkuItemDto.specJson；多规格商品规格映射，例如 [{key:"size",value:"大"}]
 */
export class SkuSpecItemDto {
  @ApiProperty({ description: '规格键名（例：size、taste）', example: 'size' })
  @IsString()
  @Length(1, 32)
  key!: string

  @ApiProperty({ description: '规格值（例：大、加辣）', example: '大' })
  @IsString()
  @Length(1, 32)
  value!: string
}

/**
 * 单条 SKU 入参
 * 用途：嵌入 SetSkuListDto.skus；CRUD 时透传 stock_qty 列
 */
export class SkuItemDto {
  @ApiPropertyOptional({ description: '商家自定义 SKU 编码（同商品内唯一；可空）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  skuCode?: string

  @ApiPropertyOptional({ description: '规格名称（拼接：大份+加辣）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  specName?: string

  @ApiPropertyOptional({
    description: '规格组合 JSON 数组',
    type: () => [SkuSpecItemDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkuSpecItemDto)
  specJson?: SkuSpecItemDto[]

  @ApiProperty({ description: 'SKU 售价（小数 2 位字符串）', example: '15.80' })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'price 必须为最多 2 位小数的字符串' })
  price!: string

  @ApiPropertyOptional({ description: 'SKU 划线价（小数 2 位字符串）' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'originalPrice 必须为最多 2 位小数的字符串' })
  originalPrice?: string

  @ApiPropertyOptional({ description: 'SKU 级打包费（小数 2 位字符串）', example: '0.00' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'packagingFee 必须为最多 2 位小数的字符串' })
  packagingFee?: string

  @ApiProperty({
    description: '库存数量；-1 表示无限库存（应用层用 Redis 缓存扣减，本期仅落库写入）',
    example: 100
  })
  @Type(() => Number)
  @IsInt()
  @Min(-1, { message: 'stockQty 最小为 -1（-1 表示无限库存）' })
  stockQty!: number

  @ApiPropertyOptional({ description: '商品重量（克）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weightG?: number

  @ApiPropertyOptional({ description: '商品体积（毫升）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  volumeMl?: number

  @ApiPropertyOptional({
    description: '是否默认 SKU：0 否 / 1 是；多规格商品需恰好一条为 1，未标记时 service 自动取首条',
    default: 0
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isDefault?: number

  @ApiPropertyOptional({ description: 'SKU 状态：0 下架 / 1 上架 / 2 售罄', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  status?: number
}

/**
 * 批量替换 SKU 列表入参
 * 用途：商户端 PUT /merchant/products/:id/skus；service 在事务内 hard delete 旧 SKU + 插入新 SKU
 */
export class SetSkuListDto {
  @ApiProperty({
    description: 'SKU 列表（至少 1 条；多规格商品需恰好一条 isDefault=1）',
    type: () => [SkuItemDto]
  })
  @IsArray()
  @ArrayMinSize(1, { message: '至少需要 1 条 SKU' })
  @ArrayMaxSize(100, { message: '单商品最多 100 条 SKU' })
  @ValidateNested({ each: true })
  @Type(() => SkuItemDto)
  skus!: SkuItemDto[]
}

/**
 * SKU 视图（商品详情 / SKU 单查）
 */
export class SkuVo {
  @ApiProperty() id!: string
  @ApiProperty() productId!: string
  @ApiProperty({ nullable: true }) skuCode!: string | null
  @ApiProperty({ nullable: true }) specName!: string | null
  @ApiProperty({ description: '规格组合 JSON', nullable: true })
  specJson!: SkuSpecItem[] | null
  @ApiProperty({ description: '售价（字符串）' }) price!: string
  @ApiProperty({ description: '划线价', nullable: true }) originalPrice!: string | null
  @ApiProperty({ description: '打包费' }) packagingFee!: string
  @ApiProperty({ description: '库存数量；-1 表示无限' }) stockQty!: number
  @ApiProperty({ description: 'SKU 销量' }) sales!: number
  @ApiProperty({ nullable: true }) weightG!: number | null
  @ApiProperty({ nullable: true }) volumeMl!: number | null
  @ApiProperty({ description: '是否默认 SKU' }) isDefault!: number
  @ApiProperty({ description: '状态：0 下架 / 1 上架 / 2 售罄' }) status!: number
  @ApiProperty() createdAt!: Date
  @ApiProperty() updatedAt!: Date
}

/**
 * Helper: 收紧 stockQty 上限避免 INT 溢出（INT 范围 [-2^31, 2^31-1]）
 * 用途：service 入库前可调用本常量做兜底校验
 */
export const STOCK_QTY_MAX = 2_000_000_000
export const stockQtyValidator = Max(STOCK_QTY_MAX, {
  message: `stockQty 不能超过 ${STOCK_QTY_MAX}`
})
