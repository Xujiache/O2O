/**
 * @file delivery-area.dto.ts
 * @stage P4/T4.2（Sprint 1）
 * @desc 配送范围 DTO：polygon 设置（含校验）+ 视图
 * @author 单 Agent V2.0
 *
 * polygon 走 GeoJSON Polygon 规范：
 *   { type: 'Polygon', coordinates: [[ [lng,lat], [lng,lat], ..., [lng,lat] ]] }
 *   外环至少 4 个点（首尾必须相同），内环可选
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateIf
} from 'class-validator'

/**
 * GeoJSON Polygon 严格 VO
 * 用途：DTO Swagger 描述 + 视图返回
 */
export class GeoJsonPolygonVo {
  @ApiProperty({ description: '固定 "Polygon"', example: 'Polygon' })
  @IsIn(['Polygon'])
  type!: 'Polygon'

  @ApiProperty({
    description: '坐标数组：[ 外环, 内环1?, 内环2?, ... ]，每环 [[lng,lat], ...] ≥ 4 点首尾闭合',
    example: [
      [
        [116.47, 39.99],
        [116.49, 39.99],
        [116.49, 39.97],
        [116.47, 39.97],
        [116.47, 39.99]
      ]
    ]
  })
  @IsArray()
  coordinates!: number[][][]
}

/**
 * 设置配送范围入参
 * 用途：PUT /api/v1/merchant/shop/:id/delivery-area
 *
 * 写库 delivery_area（area_type=1, owner_id=shopId）+ 调 MapService.setShopArea 写缓存
 */
export class SetDeliveryAreaDto {
  @ApiProperty({
    description: 'GeoJSON Polygon（外环 ≥ 4 点首尾闭合）',
    type: GeoJsonPolygonVo
  })
  @IsObject()
  @Type(() => GeoJsonPolygonVo)
  polygon!: GeoJsonPolygonVo

  @ApiPropertyOptional({ description: '区域名称（默认取 "店铺#{shopId} 配送圈"）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string

  @ApiProperty({ description: '所属城市编码（6 位）', example: '110100' })
  @IsString()
  @Length(6, 6)
  cityCode!: string

  @ApiPropertyOptional({ description: '基础配送费（元，字符串）', example: '5.00' })
  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'deliveryFee 必须为合法数值字符串' })
  deliveryFee?: string

  @ApiPropertyOptional({ description: '起送价（元，字符串）', example: '20.00' })
  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'minOrder 必须为合法数值字符串' })
  minOrder?: string

  @ApiPropertyOptional({ description: '阶梯加价规则（按距离/重量；JSON 数组，原样存）' })
  @IsOptional()
  @ValidateIf((_o, v: unknown) => v !== null && v !== undefined)
  @IsObject()
  extraFeeRule?: Record<string, unknown> | null

  @ApiPropertyOptional({ description: '优先级（同店多区域时大→优先）', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number = 0
}

/**
 * 配送范围视图
 * 用途：GET /api/v1/merchant/shop/:id/delivery-area
 */
export class DeliveryAreaVo {
  @ApiProperty({ description: '主键' }) id!: string
  @ApiProperty({ description: '区域类型：1 商户配送圈 / 2 平台跑腿服务区' }) areaType!: number
  @ApiProperty({ description: '归属 ID（type=1→shop.id；type=2→null）', nullable: true })
  ownerId!: string | null
  @ApiProperty({ description: '区域名称' }) name!: string
  @ApiProperty({ description: '所属城市编码' }) cityCode!: string
  @ApiProperty({ description: 'GeoJSON Polygon', type: GeoJsonPolygonVo })
  polygon!: GeoJsonPolygonVo
  @ApiProperty({ description: '基础配送费（type=1 时使用）', nullable: true })
  deliveryFee!: string | null
  @ApiProperty({ description: '起送价（type=1 时使用）', nullable: true }) minOrder!: string | null
  @ApiProperty({ description: '阶梯加价规则', nullable: true })
  extraFeeRule!: Record<string, unknown> | null
  @ApiProperty({ description: '优先级' }) priority!: number
  @ApiProperty({ description: '状态：0 停用 / 1 启用' }) status!: number
  @ApiProperty({ description: '创建时间' }) createdAt!: Date
  @ApiProperty({ description: '更新时间' }) updatedAt!: Date
}
