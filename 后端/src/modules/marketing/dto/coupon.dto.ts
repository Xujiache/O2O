/**
 * @file coupon.dto.ts
 * @stage P4/T4.9（Sprint 2）
 * @desc 优惠券模板 DTO：CRUD 入参 / 状态切换 / 列表查询 / 公开可领列表 / 视图对象
 * @author 单 Agent V2.0
 *
 * 字段语义对齐 07_marketing.sql 第 1 张表：
 *   - couponType    1 满减 / 2 折扣 / 3 立减 / 4 免运费
 *   - validType     1 固定时段 / 2 领取后 N 天
 *   - status        0 停用 / 1 启用 / 2 已下架
 *   - issuerType    1 平台（admin） / 2 商户（merchant）
 *   - scene         1 外卖 / 2 跑腿 / 3 通用
 *
 * 金额字段（discountValue / minOrderAmount / maxDiscount）一律用 string，
 * service 层用 BigNumber 计算，禁止 number。
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
  Max,
  MaxLength,
  Min
} from 'class-validator'
import { PageQueryDto } from '@/common'

/** 券类型枚举（与 coupon.coupon_type 列对齐） */
export const COUPON_TYPES = [1, 2, 3, 4] as const
/** 有效期类型枚举 */
export const VALID_TYPES = [1, 2] as const
/** 使用场景枚举 */
export const COUPON_SCENES = [1, 2, 3] as const
/** 状态枚举 */
export const COUPON_STATUSES = [0, 1, 2] as const
/** 发券方枚举 */
export const ISSUER_TYPES = [1, 2] as const

/**
 * 创建优惠券模板入参（管理端 / 商户端共用）
 * 用途：POST /admin/coupons（issuerType=1） / POST /merchant/coupons（issuerType=2）
 *
 * 注：issuerType / issuerId 由 controller 按端注入，不在 DTO 中暴露，避免越权。
 */
export class CreateCouponDto {
  @ApiProperty({ description: '券名称（例：满 30 减 5）', example: '满 30 减 5' })
  @IsString()
  @Length(2, 128)
  name!: string

  @ApiProperty({
    description: '券类型：1 满减 / 2 折扣 / 3 立减 / 4 免运费',
    enum: COUPON_TYPES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(COUPON_TYPES as unknown as number[])
  couponType!: number

  @ApiProperty({
    description:
      '面额：满减/立减为元（小数 2 位字符串）；折扣为 0~1（如 0.85=85 折）；免运费可填 0',
    example: '5.00'
  })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'discountValue 必须为最多 2 位小数的字符串' })
  discountValue!: string

  @ApiPropertyOptional({
    description: '订单最低金额（满减门槛，元，字符串），默认 0.00',
    example: '30.00'
  })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'minOrderAmount 必须为最多 2 位小数的字符串' })
  minOrderAmount?: string

  @ApiPropertyOptional({
    description: '最大优惠（折扣券封顶，元，字符串）；非折扣券可不传',
    example: '20.00'
  })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'maxDiscount 必须为最多 2 位小数的字符串' })
  maxDiscount?: string

  @ApiProperty({
    description: '使用场景：1 外卖 / 2 跑腿 / 3 通用',
    enum: COUPON_SCENES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(COUPON_SCENES as unknown as number[])
  scene!: number

  @ApiPropertyOptional({
    description: '适用店铺 ID 数组（NULL/不传=全部）',
    type: [String],
    example: ['180000000000000001']
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200, { message: '适用店铺最多 200 个' })
  @IsString({ each: true })
  applicableShops?: string[]

  @ApiPropertyOptional({
    description: '适用品类编码数组（NULL/不传=全部）',
    type: [String],
    example: ['food.bbq', 'food.noodle']
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: '适用品类最多 50 个' })
  @IsString({ each: true })
  applicableCategories?: string[]

  @ApiPropertyOptional({ description: '总发放数量（0=不限），默认 0', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  totalQty?: number

  @ApiPropertyOptional({ description: '每人限领数量，默认 1', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  perUserLimit?: number

  @ApiProperty({
    description: '有效期类型：1 固定时段 / 2 领取后 N 天',
    enum: VALID_TYPES,
    example: 2
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(VALID_TYPES as unknown as number[])
  validType!: number

  @ApiPropertyOptional({
    description: '固定时段起始（validType=1 必填，ISO 8601 字符串）',
    example: '2026-04-19T00:00:00.000Z'
  })
  @IsOptional()
  @IsString()
  validFrom?: string

  @ApiPropertyOptional({
    description: '固定时段结束（validType=1 必填）',
    example: '2026-05-19T23:59:59.000Z'
  })
  @IsOptional()
  @IsString()
  validTo?: string

  @ApiPropertyOptional({ description: '领取后有效天数（validType=2 必填）', example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  validDays?: number

  @ApiPropertyOptional({ description: '券面图 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string

  @ApiPropertyOptional({ description: '使用说明（≤500 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({
    description: '初始状态：0 停用 / 1 启用 / 2 已下架，默认 1',
    enum: COUPON_STATUSES,
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COUPON_STATUSES as unknown as number[])
  status?: number
}

/**
 * 编辑优惠券模板入参
 * 用途：PUT /admin/coupons/:id / PUT /merchant/coupons/:id
 *
 * 注：已发出（receivedQty>0）的券，service 层只允许改 description / status / imageUrl；
 *     不允许改面额、门槛、有效期等核心字段。
 */
export class UpdateCouponDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 128) name?: string

  @ApiPropertyOptional({ description: '使用说明' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ description: '券面图 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string

  @ApiPropertyOptional({
    description: '券类型：1 满减 / 2 折扣 / 3 立减 / 4 免运费（receivedQty=0 才允许改）',
    enum: COUPON_TYPES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COUPON_TYPES as unknown as number[])
  couponType?: number

  @ApiPropertyOptional({ description: '面额（receivedQty=0 才允许改）' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  discountValue?: string

  @ApiPropertyOptional({ description: '订单最低金额（receivedQty=0 才允许改）' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  minOrderAmount?: string

  @ApiPropertyOptional({ description: '最大优惠（折扣券封顶；receivedQty=0 才允许改）' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  maxDiscount?: string

  @ApiPropertyOptional({
    description: '使用场景（receivedQty=0 才允许改）',
    enum: COUPON_SCENES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COUPON_SCENES as unknown as number[])
  scene?: number

  @ApiPropertyOptional({ description: '适用店铺数组（receivedQty=0 才允许改）', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  applicableShops?: string[]

  @ApiPropertyOptional({ description: '适用品类数组（receivedQty=0 才允许改）', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  applicableCategories?: string[]

  @ApiPropertyOptional({ description: '总发放数量（receivedQty=0 才允许改）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  totalQty?: number

  @ApiPropertyOptional({ description: '每人限领数量（receivedQty=0 才允许改）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  perUserLimit?: number

  @ApiPropertyOptional({
    description: '有效期类型（receivedQty=0 才允许改）',
    enum: VALID_TYPES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(VALID_TYPES as unknown as number[])
  validType?: number

  @ApiPropertyOptional({ description: '固定时段起始（receivedQty=0 才允许改）' })
  @IsOptional()
  @IsString()
  validFrom?: string

  @ApiPropertyOptional({ description: '固定时段结束（receivedQty=0 才允许改）' })
  @IsOptional()
  @IsString()
  validTo?: string

  @ApiPropertyOptional({ description: '领取后有效天数（receivedQty=0 才允许改）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  validDays?: number
}

/**
 * 切换优惠券状态入参
 * 用途：PUT /merchant/coupons/:id/status
 */
export class UpdateCouponStatusDto {
  @ApiProperty({
    description: '状态：0 停用 / 1 启用 / 2 已下架',
    enum: COUPON_STATUSES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(COUPON_STATUSES as unknown as number[])
  status!: number
}

/**
 * 商户端 / 管理端 优惠券列表查询入参
 * 用途：GET /merchant/coupons / GET /admin/coupons
 */
export class QueryCouponDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '券名称模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string

  @ApiPropertyOptional({ description: '状态筛选', enum: COUPON_STATUSES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COUPON_STATUSES as unknown as number[])
  status?: number

  @ApiPropertyOptional({ description: '券类型筛选', enum: COUPON_TYPES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COUPON_TYPES as unknown as number[])
  couponType?: number

  @ApiPropertyOptional({ description: '使用场景筛选', enum: COUPON_SCENES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COUPON_SCENES as unknown as number[])
  scene?: number

  @ApiPropertyOptional({
    description: '发券方筛选（仅管理端使用：1 平台 / 2 商户）',
    enum: ISSUER_TYPES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(ISSUER_TYPES as unknown as number[])
  issuerType?: number

  @ApiPropertyOptional({ description: '发券方 ID（管理端按 merchantId 反查商户券）' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  issuerId?: string
}

/**
 * 用户端"可领券"列表查询入参
 * 用途：GET /coupons/available
 *
 * 仅展示 status=1 且未达 totalQty 的平台/商户券；按 cityCode/scene 二级筛选。
 */
export class AvailableCouponQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '城市编码（6 位）；预留参数，目前 coupon 表不带城市维度' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  cityCode?: string

  @ApiPropertyOptional({ description: '场景筛选：1 外卖 / 2 跑腿 / 3 通用', enum: COUPON_SCENES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COUPON_SCENES as unknown as number[])
  scene?: number

  @ApiPropertyOptional({ description: '指定店铺 ID（命中 applicable_shops 或 NULL=全部）' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  shopId?: string
}

/**
 * 优惠券模板视图对象
 * 用途：商户端 / 管理端 / 用户端可领列表 共用
 */
export class CouponVo {
  @ApiProperty({ description: '券模板主键（雪花字符串）' }) id!: string
  @ApiProperty({ description: '券模板编码（uk）' }) couponCode!: string
  @ApiProperty({ description: '券名称' }) name!: string
  @ApiProperty({ description: '发券方：1 平台 / 2 商户' }) issuerType!: number
  @ApiProperty({ description: '发券方 ID（issuerType=2 时为 merchant.id）', nullable: true })
  issuerId!: string | null

  @ApiProperty({ description: '券类型：1 满减 / 2 折扣 / 3 立减 / 4 免运费' }) couponType!: number
  @ApiProperty({ description: '面额（字符串）' }) discountValue!: string
  @ApiProperty({ description: '订单最低金额（字符串）' }) minOrderAmount!: string
  @ApiProperty({ description: '折扣最大优惠（字符串），nullable', nullable: true })
  maxDiscount!: string | null

  @ApiProperty({ description: '使用场景：1 外卖 / 2 跑腿 / 3 通用' }) scene!: number
  @ApiProperty({ description: '适用店铺 ID 数组（null=全部）', nullable: true, type: [String] })
  applicableShops!: string[] | null
  @ApiProperty({
    description: '适用品类编码数组（null=全部）',
    nullable: true,
    type: [String]
  })
  applicableCategories!: string[] | null

  @ApiProperty({ description: '总发放数量（0=不限）' }) totalQty!: number
  @ApiProperty({ description: '已领取数量' }) receivedQty!: number
  @ApiProperty({ description: '已使用数量' }) usedQty!: number
  @ApiProperty({ description: '每人限领数量' }) perUserLimit!: number

  @ApiProperty({ description: '有效期类型：1 固定时段 / 2 领取后 N 天' }) validType!: number
  @ApiProperty({ description: '固定时段起始', nullable: true }) validFrom!: Date | null
  @ApiProperty({ description: '固定时段结束', nullable: true }) validTo!: Date | null
  @ApiProperty({ description: '领取后有效天数', nullable: true }) validDays!: number | null

  @ApiProperty({ description: '券面图', nullable: true }) imageUrl!: string | null
  @ApiProperty({ description: '使用说明', nullable: true }) description!: string | null

  @ApiProperty({ description: '状态：0 停用 / 1 启用 / 2 已下架' }) status!: number
  @ApiProperty({ description: '创建时间' }) createdAt!: Date
  @ApiProperty({ description: '更新时间' }) updatedAt!: Date
}
