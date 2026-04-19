/**
 * @file promotion.dto.ts
 * @stage P4/T4.11（Sprint 2）
 * @desc 营销活动 DTO：CRUD 入参 / 查询 / 视图 + 5 类 rule_json 子规则
 * @author 单 Agent V2.0
 *
 * 5 类 promo_type 对应 5 类 rule_json schema：
 *   1 满减     → FullReductionRule（阶梯）
 *   2 折扣     → DiscountRule（rate + maxDiscount）
 *   3 拼单     → GroupBuyRule（groupSize + discountPerHead + timeoutMinutes）
 *   4 新人福利 → NewUserRule（discount + firstOrderOnly）
 *   5 限时秒杀 → SeckillRule（price + qty + perUserLimit）
 *
 * 校验：rule_json 入参以 Record<string, unknown> 接收，由
 *      PromotionRuleValidatorService 在 service 层做强 schema 校验，
 *      失败抛 BusinessException(PARAM_INVALID)
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min
} from 'class-validator'
import { PageQueryDto } from '@/common'

/* ============================================================================
 * 枚举
 * ============================================================================ */

/** 活动类型 */
export const PROMO_TYPES = [1, 2, 3, 4, 5] as const
export type PromoType = (typeof PROMO_TYPES)[number]

/** 发起方：1 平台 / 2 商户 */
export const ISSUER_TYPES = [1, 2] as const

/** 场景：1 外卖 / 2 跑腿 / 3 通用 */
export const SCENES = [1, 2, 3] as const

/** 状态：0 草稿 / 1 启用 / 2 暂停 / 3 已结束 */
export const PROMO_STATUSES = [0, 1, 2, 3] as const

/* ============================================================================
 * 5 类 RuleDto（接口形式 —— 由 PromotionRuleValidatorService 在 service 层校验/解析）
 * ============================================================================ */

/**
 * 满减阶梯单元
 * 示例：{ minAmount: '30.00', discount: '5.00' } —— 满 30 减 5
 */
export interface FullReductionStep {
  minAmount: string
  discount: string
}

/** promo_type=1 满减规则（按 minAmount DESC 命中首个） */
export interface FullReductionRule {
  steps: FullReductionStep[]
}

/** promo_type=2 折扣规则（rate ∈ (0,1)；maxDiscount 封顶） */
export interface DiscountRule {
  rate: string
  maxDiscount?: string
}

/** promo_type=3 拼单规则 */
export interface GroupBuyRule {
  groupSize: number
  discountPerHead: string
  timeoutMinutes: number
}

/** promo_type=4 新人福利（首单立减） */
export interface NewUserRule {
  discount: string
  firstOrderOnly: true
}

/** promo_type=5 限时秒杀（per_user_limit 控制限购，qty 与 promotion.totalQty 同步） */
export interface SeckillRule {
  price: string
  qty: number
  perUserLimit: number
}

/* ============================================================================
 * Create / Update / Query / Vo
 * ============================================================================ */

/**
 * 创建活动入参（商户/管理共用基础结构；issuerType 由 controller 注入）
 * 用途：POST /merchant/promotions、POST /admin/promotions
 *
 * 注意：merchant 端 issuerType=2 + issuerId=currentUser.uid，由 service 注入；
 *       admin 端 issuerType=1，issuerId 可为 null；
 *       入参不允许直接传 issuerType / issuerId（防越权）。
 */
export class CreatePromotionDto {
  @ApiProperty({ description: '活动名称', example: '满 30 减 5' })
  @IsString()
  @Length(2, 128)
  name!: string

  @ApiProperty({
    description: '活动类型：1 满减 / 2 折扣 / 3 拼单 / 4 新人福利 / 5 限时秒杀',
    enum: PROMO_TYPES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(PROMO_TYPES as unknown as number[])
  promoType!: PromoType

  @ApiProperty({
    description: '场景：1 外卖 / 2 跑腿 / 3 通用',
    enum: SCENES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(SCENES as unknown as number[])
  scene!: number

  @ApiPropertyOptional({
    description: '适用店铺 ID 数组（NULL=全部）',
    example: ['1234567890']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableShops?: string[]

  @ApiPropertyOptional({
    description: '适用商品 ID 数组（NULL=全部）',
    example: ['9876543210']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableProducts?: string[]

  @ApiProperty({
    description: '规则 JSON（按 promoType 走对应 schema；由 PromotionRuleValidator 校验）',
    example: { steps: [{ minAmount: '30.00', discount: '5.00' }] }
  })
  @IsObject()
  @IsNotEmpty()
  ruleJson!: Record<string, unknown>

  @ApiPropertyOptional({ description: '活动名额（0=不限）', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalQty?: number

  @ApiPropertyOptional({ description: '每人限制次数', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  perUserLimit?: number

  @ApiProperty({
    description: '生效起始（ISO 8601）',
    example: '2026-04-20T00:00:00.000Z'
  })
  @IsDateString()
  validFrom!: string

  @ApiProperty({
    description: '失效时间（ISO 8601）',
    example: '2026-05-20T23:59:59.000Z'
  })
  @IsDateString()
  validTo!: string

  @ApiPropertyOptional({ description: '优先级（多活动叠加排序）', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number

  @ApiPropertyOptional({ description: '是否可与其他活动/券叠加：0 否 / 1 是', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isStackable?: number

  @ApiPropertyOptional({ description: '活动说明', example: '感谢回馈，仅限新客' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ description: '活动图片', example: 'https://cdn.example.com/promo.png' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string
}

/**
 * 编辑活动入参
 * 约束：used_qty>0 时仅允许改 status/description（service 层校验）
 */
export class UpdatePromotionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 128) name?: string

  @ApiPropertyOptional({ description: '适用店铺 ID 数组' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableShops?: string[]

  @ApiPropertyOptional({ description: '适用商品 ID 数组' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableProducts?: string[]

  @ApiPropertyOptional({ description: '规则 JSON（修改时仍走 PromotionRuleValidator 校验）' })
  @IsOptional()
  @IsObject()
  ruleJson?: Record<string, unknown>

  @ApiPropertyOptional({ description: '活动名额' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalQty?: number

  @ApiPropertyOptional({ description: '每人限制次数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  perUserLimit?: number

  @ApiPropertyOptional({ description: '生效起始（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  validFrom?: string

  @ApiPropertyOptional({ description: '失效时间（ISO 8601）' })
  @IsOptional()
  @IsDateString()
  validTo?: string

  @ApiPropertyOptional({ description: '优先级' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number

  @ApiPropertyOptional({ description: '是否可叠加：0 否 / 1 是' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isStackable?: number

  @ApiPropertyOptional({ description: '活动说明（used_qty>0 时仅可改本字段 + status）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ description: '活动图片 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string
}

/**
 * 状态流转入参（商户/管理共用）
 * 用途：PUT /merchant/promotions/:id/status、PUT /admin/promotions/:id/status
 */
export class UpdatePromotionStatusDto {
  @ApiProperty({
    description: '目标状态：0 草稿 / 1 启用 / 2 暂停 / 3 已结束',
    enum: PROMO_STATUSES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(PROMO_STATUSES as unknown as number[])
  status!: number
}

/**
 * 管理端强制停用入参
 * 用途：PUT /admin/promotions/:id/force-stop
 */
export class ForceStopPromotionDto {
  @ApiProperty({ description: '强制停用原因（必填，写入 OperationLog）', example: '违规营销' })
  @IsString()
  @Length(2, 255)
  reason!: string
}

/**
 * 商户/管理端 活动列表查询入参
 * 用途：GET /merchant/promotions、GET /admin/promotions
 */
export class QueryPromotionDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '活动名称模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string

  @ApiPropertyOptional({
    description: '活动类型：1 满减 / 2 折扣 / 3 拼单 / 4 新人福利 / 5 限时秒杀'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(PROMO_TYPES as unknown as number[])
  promoType?: number

  @ApiPropertyOptional({ description: '状态：0 草稿 / 1 启用 / 2 暂停 / 3 已结束' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(PROMO_STATUSES as unknown as number[])
  status?: number

  @ApiPropertyOptional({ description: '场景：1 外卖 / 2 跑腿 / 3 通用' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(SCENES as unknown as number[])
  scene?: number

  @ApiPropertyOptional({ description: '发起方过滤（仅管理端）：1 平台 / 2 商户' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(ISSUER_TYPES as unknown as number[])
  issuerType?: number
}

/**
 * 用户端 店铺活动列表 查询（不分页，固定取当前生效）
 * 用途：GET /shops/:shopId/promotions?scene=1
 */
export class QueryShopPromotionDto {
  @ApiPropertyOptional({ description: '场景：1 外卖 / 2 跑腿 / 3 通用（不传 = 全部）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(SCENES as unknown as number[])
  scene?: number
}

/**
 * 活动视图（统一返回结构）
 */
export class PromotionVo {
  @ApiProperty({ description: '活动主键' }) id!: string
  @ApiProperty({ description: '活动编码（系统生成）' }) promotionCode!: string
  @ApiProperty({ description: '活动名称' }) name!: string
  @ApiProperty({ description: '活动类型：1 满减 / 2 折扣 / 3 拼单 / 4 新人福利 / 5 限时秒杀' })
  promoType!: number
  @ApiProperty({ description: '发起方：1 平台 / 2 商户' }) issuerType!: number
  @ApiProperty({ description: '发起方 ID', nullable: true }) issuerId!: string | null
  @ApiProperty({ description: '场景：1 外卖 / 2 跑腿 / 3 通用' }) scene!: number

  @ApiProperty({ description: '适用店铺 ID 数组（null=全部）', nullable: true })
  applicableShops!: string[] | null

  @ApiProperty({ description: '适用商品 ID 数组（null=全部）', nullable: true })
  applicableProducts!: string[] | null

  @ApiProperty({ description: '规则 JSON（按 promoType 区分 schema）' })
  ruleJson!: Record<string, unknown>

  @ApiProperty({ description: '活动名额（0=不限）' }) totalQty!: number
  @ApiProperty({ description: '已用名额' }) usedQty!: number
  @ApiProperty({ description: '每人限制次数' }) perUserLimit!: number
  @ApiProperty({ description: '生效起始' }) validFrom!: Date
  @ApiProperty({ description: '失效时间' }) validTo!: Date
  @ApiProperty({ description: '优先级' }) priority!: number
  @ApiProperty({ description: '是否可叠加：0 否 / 1 是' }) isStackable!: number
  @ApiProperty({ description: '活动说明', nullable: true }) description!: string | null
  @ApiProperty({ description: '活动图片', nullable: true }) imageUrl!: string | null
  @ApiProperty({ description: '状态：0 草稿 / 1 启用 / 2 暂停 / 3 已结束' }) status!: number
  @ApiProperty({ description: '创建时间' }) createdAt!: Date
  @ApiProperty({ description: '更新时间' }) updatedAt!: Date
}
