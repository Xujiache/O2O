/**
 * @file discount-calc.dto.ts
 * @stage P4/T4.13（Sprint 2）
 * @desc 下单时优惠计算 DTO：DiscountCalc.calc(ctx) 入参 / 出参 / 单条抵扣项
 * @author 单 Agent V2.0
 *
 * 全部金额字段均为「元，string」，由 BigNumber.js 全程计算，避免浮点误差。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString
} from 'class-validator'

/** 订单类型：1 外卖 / 2 跑腿 */
export const ORDER_TYPES = [1, 2] as const

/** 抵扣类型来源 */
export const DISCOUNT_ITEM_TYPES = ['coupon', 'promotion', 'red_packet'] as const
export type DiscountItemType = (typeof DISCOUNT_ITEM_TYPES)[number]

/**
 * DiscountCalc 入参 ctx
 * 用途：POST /me/discount-preview / Order 模块下单时调用
 *
 * 字段：
 *   - userId            当前用户 ID（service 自动注入；DTO 仍接收以便复用）
 *   - orderType         1 外卖 / 2 跑腿
 *   - shopId            涉及店铺（外卖必填；跑腿可选）
 *   - itemsAmount       商品/服务金额（元，string）
 *   - deliveryFee       配送费（元，string）
 *   - packageFee        打包费（元，string，可选）
 *   - productIds        涉及商品（用于 applicable_products 命中）
 *   - userCouponIds     用户主动选中的券（不传 = 自动加载用户全部 status=1 user_coupon）
 *   - promotionIds      活动 ID（不传 = 自动加载店铺全部进行中活动）
 *   - isNewUser         是否首单（影响 promo_type=4 新人福利适用）
 */
export class DiscountCalcContextDto {
  @ApiPropertyOptional({
    description: '用户 ID（controller 端自动注入；DTO 仍允许接收以便单测）',
    example: '1234567890'
  })
  @IsOptional()
  @IsString()
  userId?: string

  @ApiProperty({
    description: '订单类型：1 外卖 / 2 跑腿',
    enum: ORDER_TYPES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(ORDER_TYPES as unknown as number[])
  orderType!: number

  @ApiPropertyOptional({ description: '店铺 ID（外卖必填，跑腿可选）', example: '1234567890' })
  @IsOptional()
  @IsString()
  shopId?: string

  @ApiProperty({ description: '商品/服务金额（元，字符串）', example: '50.00' })
  @IsNumberString({ no_symbols: false }, { message: 'itemsAmount 必须为合法数值字符串' })
  itemsAmount!: string

  @ApiProperty({ description: '配送费（元，字符串；不收取请填 "0"）', example: '5.00' })
  @IsNumberString({ no_symbols: false }, { message: 'deliveryFee 必须为合法数值字符串' })
  deliveryFee!: string

  @ApiPropertyOptional({ description: '打包费（元，字符串）', example: '1.00' })
  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'packageFee 必须为合法数值字符串' })
  packageFee?: string

  @ApiPropertyOptional({
    description: '涉及商品 ID 列表（用于 applicable_products 命中匹配）',
    isArray: true,
    example: ['9876543210']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[]

  @ApiPropertyOptional({
    description: '用户主动选中的 user_coupon ID 列表（不传 = 自动加载全部可用券）',
    isArray: true,
    example: ['1111222233']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userCouponIds?: string[]

  @ApiPropertyOptional({
    description: '活动 ID 列表（不传 = 自动加载店铺全部进行中活动）',
    isArray: true,
    example: ['7777888899']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  promotionIds?: string[]

  @ApiPropertyOptional({ description: '是否首单用户（影响新人福利 promo_type=4）', example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isNewUser?: boolean
}

/**
 * 单条抵扣明细
 * 字段：
 *   - type      'coupon' | 'promotion' | 'red_packet'（red_packet 由 Agent C 后续接入；本期 calc 仅产 coupon + promotion）
 *   - sourceId  券或活动主键
 *   - name      展示文案
 *   - amount    抵扣金额（元，字符串）
 */
export class DiscountItemDto {
  @ApiProperty({
    description: '抵扣来源类型',
    enum: DISCOUNT_ITEM_TYPES,
    example: 'coupon'
  })
  type!: DiscountItemType

  @ApiProperty({ description: '来源主键（user_coupon.id / promotion.id / red_packet.id）' })
  sourceId!: string

  @ApiProperty({ description: '抵扣名称（用户可读）', example: '满 30 减 5' })
  name!: string

  @ApiProperty({ description: '抵扣金额（元，字符串）', example: '5.00' })
  amount!: string
}

/**
 * DiscountCalc 出参
 * 字段：
 *   - itemsAmount    原始商品金额
 *   - discountTotal  总抵扣（不含运费/打包费独立项；含 免运费 抵的运费部分）
 *   - finalAmount    最终支付（≥ 0.01）
 *   - details        每条抵扣项明细
 */
export class DiscountCalcResultDto {
  @ApiProperty({ description: '原始商品/服务金额（元，字符串）', example: '50.00' })
  itemsAmount!: string

  @ApiProperty({ description: '配送费（元，字符串；可能已被免运费抵扣）', example: '5.00' })
  deliveryFee!: string

  @ApiProperty({ description: '打包费（元，字符串）', example: '1.00' })
  packageFee!: string

  @ApiProperty({ description: '总抵扣金额（元，字符串）', example: '8.00' })
  discountTotal!: string

  @ApiProperty({ description: '最终应支付金额（元，字符串；≥ 0.01）', example: '48.00' })
  finalAmount!: string

  @ApiProperty({ description: '抵扣明细', type: DiscountItemDto, isArray: true })
  details!: DiscountItemDto[]
}
