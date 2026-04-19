/**
 * @file review.dto.ts
 * @stage P4/T4.44（Sprint 7）
 * @desc 评价 DTO：提交 / 修改 / 列表查询 / 视图对象
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 字段语义对齐 08_review.sql 第 1 张表 review：
 *   - score / taste_score / package_score / delivery_score 1~5
 *   - target_type 1 店铺 / 2 商品 / 3 骑手 / 4 综合
 *   - is_anonymous 0 否 / 1 是
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
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
import { REVIEW_TARGET_TYPES } from '../types/review.types'

/* ============================================================================
 * 1) 提交评价
 * ============================================================================ */

/**
 * 提交评价入参
 * 用途：POST /me/order/:orderNo/reviews（按订单一次性提交多个 target 类评价；最常见
 *      的客户行为：综合评论 + 给店铺打分 + 给骑手打分 → 3 行 review）
 *
 * 注：本接口一次只提交一条 review（targetType + targetId 唯一）。前端如需提交多条，
 *     循环调用本接口（每次走一遍 uk_order_target 唯一索引）。
 */
export class SubmitReviewDto {
  @ApiProperty({ description: '订单号（18 位）', example: 'D202604190100000123' })
  @IsString()
  @Length(18, 18, { message: 'orderNo 必须为 18 位订单号' })
  orderNo!: string

  @ApiProperty({
    description: '评价对象类型：1 店铺 / 2 商品 / 3 骑手 / 4 综合',
    enum: REVIEW_TARGET_TYPES,
    example: 1
  })
  @Type(() => Number)
  @IsInt({ message: 'targetType 必须为整数' })
  @IsIn(REVIEW_TARGET_TYPES as unknown as number[], {
    message: 'targetType 仅支持 1/2/3/4'
  })
  targetType!: number

  @ApiProperty({
    description: '对象 ID（targetType=1 店铺ID / 2 商品ID / 3 骑手ID / 4 订单号或 0）',
    example: '7203456789012345678'
  })
  @IsString()
  @Length(1, 32)
  targetId!: string

  @ApiProperty({ description: '总分（1~5）', minimum: 1, maximum: 5, example: 5 })
  @Type(() => Number)
  @IsInt({ message: 'score 必须为整数' })
  @Min(1, { message: 'score 最小为 1' })
  @Max(5, { message: 'score 最大为 5' })
  score!: number

  @ApiPropertyOptional({ description: '口味分（外卖 1~5）', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  tasteScore?: number

  @ApiPropertyOptional({ description: '包装分（外卖 1~5）', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  packageScore?: number

  @ApiPropertyOptional({ description: '配送/服务分 1~5', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  deliveryScore?: number

  @ApiPropertyOptional({ description: '评价文字（≤ 1000）', example: '味道很赞，骑手准时' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'content 不能超过 1000 字' })
  content?: string

  @ApiPropertyOptional({
    description: '图片 URL 数组（最多 9 张）',
    type: [String],
    example: ['https://cdn.x.com/r/1.jpg']
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9, { message: 'imageUrls 最多 9 张' })
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  imageUrls?: string[]

  @ApiPropertyOptional({
    description: '标签数组（如 "分量足"/"很辣"，最多 10 个）',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'tags 最多 10 个' })
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[]

  @ApiPropertyOptional({ description: '是否匿名：0 否 / 1 是（默认 0）', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isAnonymous?: number
}

/* ============================================================================
 * 2) 修改评价（24h 窗口）
 * ============================================================================ */

/**
 * 修改评价入参
 * 用途：PUT /me/reviews/:id（提交后 24h 内可改）
 *
 * 仅允许修改：score / 子分 / content / imageUrls / tags / isAnonymous
 * 禁止修改：orderNo / targetType / targetId / userId / shop_id / rider_id
 */
export class UpdateReviewDto {
  @ApiPropertyOptional({ description: '总分（1~5）', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  score?: number

  @ApiPropertyOptional({ description: '口味分（外卖 1~5）', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  tasteScore?: number

  @ApiPropertyOptional({ description: '包装分（外卖 1~5）', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  packageScore?: number

  @ApiPropertyOptional({ description: '配送/服务分 1~5', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  deliveryScore?: number

  @ApiPropertyOptional({ description: '评价文字（≤ 1000）' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  content?: string

  @ApiPropertyOptional({ description: '图片 URL 数组（最多 9 张）', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  imageUrls?: string[]

  @ApiPropertyOptional({ description: '标签数组（最多 10 个）', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[]

  @ApiPropertyOptional({ description: '是否匿名：0 否 / 1 是' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isAnonymous?: number
}

/* ============================================================================
 * 3) 列表查询
 * ============================================================================ */

/**
 * 评价列表查询入参
 * 用途：用户/商户/骑手/管理端 GET /reviews
 *
 * 字段约定（按端裁剪）：
 *   - 用户端：默认 userId = 当前 uid（service 层注入），仅传分页
 *   - 商户端：默认 shopId = 商户名下店铺（仅商户的店）
 *   - 骑手端：默认 riderId = 当前 uid（仅 score ≤ 3）
 *   - 管理端：可任意按 targetType / targetId / shopId / riderId / userId / score 过滤
 */
export class QueryReviewDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '评价对象类型：1/2/3/4' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(REVIEW_TARGET_TYPES as unknown as number[])
  targetType?: number

  @ApiPropertyOptional({ description: '对象 ID' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  targetId?: string

  @ApiPropertyOptional({ description: '店铺 ID（用于按店铺聚合）' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  shopId?: string

  @ApiPropertyOptional({ description: '骑手 ID（管理端 / 骑手端）' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  riderId?: string

  @ApiPropertyOptional({ description: '订单号（精确匹配）' })
  @IsOptional()
  @IsString()
  @Length(1, 18)
  orderNo?: string

  @ApiPropertyOptional({ description: '最低分（含）', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  scoreMin?: number

  @ApiPropertyOptional({ description: '最高分（含）', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  scoreMax?: number

  @ApiPropertyOptional({ description: '是否仅查未隐藏：1 仅未隐藏 / 0 全部（默认 1）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  onlyVisible?: number

  @ApiPropertyOptional({ description: '是否仅查置顶：1 仅置顶 / 0 全部' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  onlyTop?: number

  @ApiPropertyOptional({ description: '管理端：按 user_id 筛' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  userId?: string
}

/* ============================================================================
 * 4) 管理端违规处理
 * ============================================================================ */

/** 违规处理入参（隐藏） */
export class HideReviewDto {
  @ApiProperty({ description: '隐藏原因（≤ 200）', example: '违反社区规范' })
  @IsString()
  @Length(1, 200)
  reason!: string
}

/** 置顶/取消置顶 入参 */
export class TopReviewDto {
  @ApiProperty({ description: '是否置顶：1 置顶 / 0 取消置顶', example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isTop!: number
}

/* ============================================================================
 * 5) ReviewVo
 * ============================================================================ */

/** 评价视图对象 */
export class ReviewVo {
  @ApiProperty({ description: '评价主键' })
  id!: string

  @ApiProperty({ description: '订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型：1 外卖 / 2 跑腿' })
  orderType!: number

  @ApiProperty({ description: '评价用户 ID' })
  userId!: string

  @ApiProperty({ description: '评价对象类型 1/2/3/4' })
  targetType!: number

  @ApiProperty({ description: '对象 ID' })
  targetId!: string

  @ApiProperty({ description: '店铺 ID（冗余）', nullable: true })
  shopId!: string | null

  @ApiProperty({ description: '骑手 ID（冗余）', nullable: true })
  riderId!: string | null

  @ApiProperty({ description: '总分 1~5' })
  score!: number

  @ApiProperty({ description: '口味分（外卖）', nullable: true })
  tasteScore!: number | null

  @ApiProperty({ description: '包装分（外卖）', nullable: true })
  packageScore!: number | null

  @ApiProperty({ description: '配送/服务分', nullable: true })
  deliveryScore!: number | null

  @ApiProperty({ description: '评价内容', nullable: true })
  content!: string | null

  @ApiProperty({ description: '图片 URL 数组', type: [String], nullable: true })
  imageUrls!: string[] | null

  @ApiProperty({ description: '标签数组', type: [String], nullable: true })
  tags!: string[] | null

  @ApiProperty({ description: '是否匿名 0/1' })
  isAnonymous!: number

  @ApiProperty({ description: '是否置顶 0/1' })
  isTop!: number

  @ApiProperty({ description: '是否隐藏 0/1' })
  isHidden!: number

  @ApiProperty({ description: '有用计数' })
  usefulCount!: number

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}

/* ============================================================================
 * 6) Useful 计数自增
 * ============================================================================ */

/** 增加 / 减少 useful_count 的入参（仅 +1 / -1） */
export class UsefulVoteDto {
  @ApiProperty({ description: '+1 增加 / -1 减少', enum: [1, -1] })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, -1])
  delta!: number
}

/* ============================================================================
 * 7) 金额辅助校验（仅本 DTO 文件用，不导出供其他文件复用）
 * ============================================================================ */

/**
 * 通用金额字段校验装饰器组合（保留给售后/仲裁 DTO 使用）
 * 注：实际使用在 after-sale.dto.ts / arbitration.dto.ts 内本地组装
 */
export const _MONEY_VALIDATORS = [IsNumberString({ no_symbols: false })]
