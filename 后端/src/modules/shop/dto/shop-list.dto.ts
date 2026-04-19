/**
 * @file shop-list.dto.ts
 * @stage P4/T4.3（Sprint 1）
 * @desc 用户端店铺列表 DTO：GEO + 排序 + 筛选 + 视图
 * @author 单 Agent V2.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  MaxLength
} from 'class-validator'
import { PageQueryDto } from '@/common'

/**
 * 排序枚举（PRD §3.1.2.1 推荐展示）
 *   distance 距离最近（需 lng/lat）
 *   sales    销量优先（monthly_sales DESC）
 *   score    评分优先（score DESC）
 *   price    起送价升序（min_order_amount ASC）
 */
export const SHOP_SORT_VALUES = ['distance', 'sales', 'score', 'price'] as const
export type ShopSort = (typeof SHOP_SORT_VALUES)[number]

/**
 * 用户端店铺列表查询入参
 * 用途：GET /api/v1/shops
 *
 * 注：sort=distance 时必须同时传 lng/lat，否则后端忽略并退化为按 score 排序
 */
export class PublicShopListQueryDto extends PageQueryDto {
  @ApiProperty({ description: '城市编码（6 位，必填，缓存键的一部分）', example: '110100' })
  @IsString()
  @Length(6, 6)
  cityCode!: string

  @ApiPropertyOptional({ description: '当前定位经度（GCJ-02），sort=distance 必填' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number

  @ApiPropertyOptional({ description: '当前定位纬度（GCJ-02），sort=distance 必填' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number

  @ApiPropertyOptional({ description: '关键字（店铺名 / 简称模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string

  @ApiPropertyOptional({ description: '行业分类编码（精确匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  industry?: string

  @ApiPropertyOptional({
    description: '排序：distance | sales | score | price',
    enum: SHOP_SORT_VALUES,
    default: 'distance'
  })
  @IsOptional()
  @IsIn(SHOP_SORT_VALUES as unknown as string[])
  sort?: ShopSort = 'distance'
}

/**
 * 用户端店铺列表项 VO
 * 用途：GET /api/v1/shops 列表项；GET /api/v1/shops/:id 复用作为详情主体（公开视图，无电话）
 */
export class PublicShopListItemVo {
  @ApiProperty({ description: '店铺主键' }) id!: string
  @ApiProperty({ description: '店铺名称' }) name!: string
  @ApiProperty({ description: '店铺简称', nullable: true }) shortName!: string | null
  @ApiProperty({ description: '店铺 LOGO', nullable: true }) logoUrl!: string | null
  @ApiProperty({ description: '店铺封面图', nullable: true }) coverUrl!: string | null
  @ApiProperty({ description: '行业分类编码' }) industryCode!: string
  @ApiProperty({ description: '门店详细地址' }) address!: string
  @ApiProperty({ description: '门店经度（GCJ-02）' }) lng!: number
  @ApiProperty({ description: '门店纬度（GCJ-02）' }) lat!: number

  @ApiProperty({ description: '到当前定位的距离（米；未传 lng/lat 则为 -1）', example: 1280 })
  distance!: number

  @ApiProperty({ description: '综合评分（0~5.00，字符串）', example: '5.00' }) score!: string
  @ApiProperty({ description: '评分人数' }) scoreCount!: number
  @ApiProperty({ description: '月销量' }) monthlySales!: number
  @ApiProperty({ description: '起送价（元，字符串）' }) minOrderAmount!: string
  @ApiProperty({ description: '基础配送费（元，字符串）' }) baseDeliveryFee!: string
  @ApiProperty({ description: '默认打包费（元，字符串）' }) packagingFee!: string
  @ApiProperty({ description: '平均出餐时长（分钟）' }) avgPrepareMin!: number
  @ApiProperty({ description: '营业状态：0 打烊 / 1 营业中 / 2 临时歇业' }) businessStatus!: number
  @ApiProperty({ description: '当前是否营业（结合营业时段 + business_status 计算）' })
  isOpenNow!: boolean
  @ApiProperty({ description: '店铺公告', nullable: true }) announcement!: string | null
  @ApiProperty({ description: '营业时间摘要', nullable: true })
  businessHoursSummary!: string | null
  @ApiProperty({ description: '城市编码' }) cityCode!: string
  @ApiProperty({ description: '区/县编码' }) districtCode!: string
}
