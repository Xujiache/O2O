/**
 * @file product-combo.dto.ts
 * @stage P4/T4.5（Sprint 1）
 * @desc 套餐子项 DTO：批量替换；下单时按子项 SKU 各自扣减库存（库存逻辑由 Agent C 实现）
 * @author 单 Agent V2.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumberString,
  IsOptional,
  Length,
  Max,
  Min,
  ValidateNested
} from 'class-validator'

/**
 * 套餐子项入参
 * 用途：嵌入 SetComboItemsDto.items；仅当 product.product_type=2 时允许
 */
export class ComboItemDto {
  @ApiProperty({ description: '子商品 ID（雪花字符串）', example: '180000000000000010' })
  @IsNumberString({ no_symbols: true }, { message: 'itemProductId 必须为雪花数字字符串' })
  @Length(1, 32)
  itemProductId!: string

  @ApiProperty({
    description: '子 SKU ID（即使单规格也填 default SKU 的 ID）',
    example: '180000000000000020'
  })
  @IsNumberString({ no_symbols: true }, { message: 'itemSkuId 必须为雪花数字字符串' })
  @Length(1, 32)
  itemSkuId!: string

  @ApiProperty({ description: '该子项数量', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '子项数量至少为 1' })
  @Max(999, { message: '子项数量上限 999' })
  qty!: number

  @ApiPropertyOptional({ description: '排序权重（小→前）', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number
}

/**
 * 批量替换套餐子项入参
 * 用途：商户端 PUT /merchant/products/:id/combo-items；service 在事务内 hard delete 旧子项 + 插入新子项
 */
export class SetComboItemsDto {
  @ApiProperty({
    description: '套餐子项列表（至少 1 条；同一组合内允许重复 itemSkuId 但需 service 校验）',
    type: () => [ComboItemDto]
  })
  @IsArray()
  @ArrayMinSize(1, { message: '套餐至少包含 1 个子项' })
  @ArrayMaxSize(50, { message: '套餐最多 50 个子项' })
  @ValidateNested({ each: true })
  @Type(() => ComboItemDto)
  items!: ComboItemDto[]
}

/**
 * 套餐子项视图（含展开后的子商品摘要，便于详情接口直出）
 */
export class ComboItemVo {
  @ApiProperty() id!: string
  @ApiProperty() comboProductId!: string
  @ApiProperty() itemProductId!: string
  @ApiProperty() itemSkuId!: string
  @ApiProperty({ description: '该子项数量' }) qty!: number
  @ApiProperty({ description: '排序权重' }) sort!: number

  /* ===== 展开字段（详情接口填充；list 接口可置 null） ===== */
  @ApiPropertyOptional({ description: '子商品名称（展开）', nullable: true })
  itemProductName?: string | null
  @ApiPropertyOptional({ description: '子 SKU 规格名（展开）', nullable: true })
  itemSpecName?: string | null
  @ApiPropertyOptional({ description: '子 SKU 售价（展开，字符串）', nullable: true })
  itemPrice?: string | null
}
