/**
 * @file product-category.dto.ts
 * @stage P4/T4.4（Sprint 1）
 * @desc 商品分类 DTO：2 级分类 CRUD（同 shop 内 name 唯一）+ 树形 VO
 * @author 单 Agent V2.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min
} from 'class-validator'

/**
 * 创建商品分类入参
 * 用途：商户端 POST /merchant/product-categories
 */
export class CreateCategoryDto {
  @ApiProperty({ description: '所属店铺 ID（雪花字符串）', example: '180000000000000001' })
  @IsNumberString({ no_symbols: true }, { message: 'shopId 必须为雪花数字字符串' })
  @Length(1, 32)
  shopId!: string

  @ApiPropertyOptional({
    description: '父分类 ID；0 或不传 表示一级分类（仅支持 2 级）',
    example: '0'
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true }, { message: 'parentId 必须为雪花数字字符串或 "0"' })
  @Length(1, 32)
  parentId?: string

  @ApiProperty({ description: '分类名称（同店铺内唯一）', example: '招牌菜' })
  @IsString()
  @Length(1, 64)
  name!: string

  @ApiPropertyOptional({ description: '分类图标 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  iconUrl?: string

  @ApiPropertyOptional({ description: '排序权重（小→前）', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number

  @ApiPropertyOptional({ description: '状态：0 下架 / 1 上架', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number
}

/**
 * 更新商品分类入参
 * 用途：商户端 PUT /merchant/product-categories/:id
 */
export class UpdateCategoryDto {
  @ApiPropertyOptional({ description: '分类名称（同店铺内唯一）' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string

  @ApiPropertyOptional({ description: '分类图标 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  iconUrl?: string

  @ApiPropertyOptional({ description: '排序权重（小→前）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number

  @ApiPropertyOptional({ description: '状态：0 下架 / 1 上架' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number
}

/**
 * 商品分类视图（树形）
 * 用途：商户端 / 用户端展示分类树；children 仅一级分类承载二级分类
 */
export class CategoryVo {
  @ApiProperty({ description: '分类 ID（雪花字符串）' }) id!: string
  @ApiProperty({ description: '所属店铺 ID' }) shopId!: string
  @ApiProperty({ description: '父分类 ID；"0" 表示根' }) parentId!: string
  @ApiProperty({ description: '分类名称' }) name!: string
  @ApiProperty({ description: '分类图标 URL', nullable: true }) iconUrl!: string | null
  @ApiProperty({ description: '排序权重' }) sort!: number
  @ApiProperty({ description: '状态：0 下架 / 1 上架' }) status!: number
  @ApiProperty({ description: '创建时间' }) createdAt!: Date
  @ApiProperty({ description: '更新时间' }) updatedAt!: Date

  @ApiPropertyOptional({
    description: '子分类（仅根分类承载；二级分类无 children）',
    type: () => [CategoryVo]
  })
  children?: CategoryVo[]
}
