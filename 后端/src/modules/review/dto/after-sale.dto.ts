/**
 * @file after-sale.dto.ts
 * @stage P4/T4.48（Sprint 7）
 * @desc 售后工单 DTO：用户申请 + 商户处理 + 用户升级仲裁 + 管理端仲裁 + 视图对象
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 字段语义对齐 04_order.sql 第 6 张表 order_after_sale：
 *   - type   1 仅退款 / 2 退货退款 / 3 换货 / 4 投诉
 *   - status 0 申请中 / 10 商户处理中 / 20 平台仲裁中 /
 *            30 已同意 / 40 已拒绝 / 50 已退款 / 60 已关闭
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsDecimal,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength
} from 'class-validator'
import { PageQueryDto } from '@/common'

/* ============================================================================
 * 1) 用户提交售后申请
 * ============================================================================ */

/** 售后类型可选值 */
export const AFTER_SALE_TYPES = [1, 2, 3, 4] as const

/** 创建售后入参（user 端） */
export class CreateAfterSaleDto {
  @ApiProperty({
    description: '类型：1 仅退款 / 2 退货退款 / 3 换货 / 4 投诉',
    enum: AFTER_SALE_TYPES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(AFTER_SALE_TYPES as unknown as number[])
  type!: number

  @ApiProperty({
    description: '原因编码（→ sys_dict aftersale_reason，例 wrong_item / quality / late）',
    example: 'wrong_item',
    maxLength: 64
  })
  @IsString()
  @Length(1, 64)
  reasonCode!: string

  @ApiPropertyOptional({ description: '原因描述（≤ 500 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonDetail?: string

  @ApiPropertyOptional({
    description: '证据图片 URL 数组（最多 9 张）',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  evidenceUrls?: string[]

  @ApiProperty({
    description: '申请退款金额（元，字符串；不能超过订单 payAmount）',
    example: '20.00'
  })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'applyAmount 必须为最多 2 位小数' })
  applyAmount!: string
}

/* ============================================================================
 * 2) 商户处理（agree / reject）
 * ============================================================================ */

/** 商户处理动作字面量 */
export const AFTER_SALE_MERCHANT_ACTIONS = ['agree', 'reject'] as const

/**
 * 商户处理售后入参
 * 用途：POST /merchant/after-sales/:id/handle
 *
 * 业务规则：
 *   - action=agree：actualAmount 必填且 ≤ applyAmount → status=30 已同意 → 后台触发 refund
 *     退款成功回调或同步处理后置 status=50 已退款（本期：service.merchantAgree 同步触发 refund）
 *   - action=reject：merchantReply 必填 → status=40 已拒绝（用户可升级仲裁 → 20）
 */
export class HandleAfterSaleByMerchantDto {
  @ApiProperty({
    description: '动作：agree 同意 / reject 拒绝',
    enum: AFTER_SALE_MERCHANT_ACTIONS,
    example: 'agree'
  })
  @IsString()
  @IsIn(AFTER_SALE_MERCHANT_ACTIONS as unknown as string[])
  action!: 'agree' | 'reject'

  @ApiProperty({ description: '商户回复（1~500 字）' })
  @IsString()
  @Length(1, 500)
  merchantReply!: string

  @ApiPropertyOptional({
    description: '实际退款金额（元，字符串；agree 必填，需 ≤ applyAmount）',
    example: '20.00'
  })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'actualAmount 必须为最多 2 位小数' })
  actualAmount?: string
}

/* ============================================================================
 * 3) 用户升级仲裁
 * ============================================================================ */

/**
 * 用户升级仲裁入参
 * 用途：POST /me/after-sales/:id/escalate
 *
 * 前置：售后 status=40 已拒绝
 */
export class EscalateAfterSaleByUserDto {
  @ApiProperty({ description: '争议描述（1~2000 字）' })
  @IsString()
  @Length(1, 2000)
  disputeContent!: string

  @ApiPropertyOptional({
    description: '补充证据 URL 数组（最多 9 张）',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  evidenceUrls?: string[]
}

/* ============================================================================
 * 4) 管理端 仲裁售后
 * ============================================================================ */

/** 售后仲裁动作字面量 */
export const AFTER_SALE_RESOLVE_ACTIONS = ['agree', 'reject'] as const

/**
 * 管理端 仲裁售后入参
 * 用途：POST /admin/after-sales/:id/resolve
 *
 * 业务规则：
 *   - action=agree：actualAmount 必填 → status=30 已同意 → 立即调 refund → status=50 已退款
 *   - action=reject：handleResult 必填 → status=40 已拒绝（用户已用过升级途径，下一步关闭）
 */
export class ResolveAfterSaleDto {
  @ApiProperty({
    description: '动作：agree 同意（含部分同意）/ reject 拒绝',
    enum: AFTER_SALE_RESOLVE_ACTIONS,
    example: 'agree'
  })
  @IsString()
  @IsIn(AFTER_SALE_RESOLVE_ACTIONS as unknown as string[])
  action!: 'agree' | 'reject'

  @ApiProperty({ description: '处理结果 / 仲裁意见（1~2000 字）' })
  @IsString()
  @Length(1, 2000)
  handleResult!: string

  @ApiPropertyOptional({
    description: '实际退款金额（元，字符串；agree 必填）',
    example: '20.00'
  })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'actualAmount 必须为最多 2 位小数' })
  actualAmount?: string
}

/* ============================================================================
 * 5) 列表查询
 * ============================================================================ */

/** 售后状态可选值（与 AfterSaleStatusEnum 对齐） */
export const AFTER_SALE_STATUSES = [0, 10, 20, 30, 40, 50, 60] as const

/** 售后查询入参 */
export class QueryAfterSaleDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '状态：0/10/20/30/40/50/60', enum: AFTER_SALE_STATUSES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(AFTER_SALE_STATUSES as unknown as number[])
  status?: number

  @ApiPropertyOptional({ description: '类型 1/2/3/4' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(AFTER_SALE_TYPES as unknown as number[])
  type?: number

  @ApiPropertyOptional({ description: '订单类型：1 外卖 / 2 跑腿' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  orderType?: number

  @ApiPropertyOptional({ description: '关联订单号' })
  @IsOptional()
  @IsString()
  @Length(1, 18)
  orderNo?: string

  @ApiPropertyOptional({ description: '管理端：按用户 ID 筛' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  userId?: string

  @ApiPropertyOptional({ description: '管理端 / 商户端：按店铺 ID 筛' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  shopId?: string

  @ApiPropertyOptional({ description: '管理端：按骑手 ID 筛' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  riderId?: string
}

/* ============================================================================
 * 6) AfterSaleVo
 * ============================================================================ */

/** 售后视图对象 */
export class AfterSaleVo {
  @ApiProperty({ description: '售后主键' })
  id!: string

  @ApiProperty({ description: '售后单号 AS+yyyyMMdd+seq' })
  afterSaleNo!: string

  @ApiProperty({ description: '关联订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型 1 外卖 / 2 跑腿' })
  orderType!: number

  @ApiProperty({ description: '申请用户 ID' })
  userId!: string

  @ApiProperty({ description: '店铺 ID（外卖）', nullable: true })
  shopId!: string | null

  @ApiProperty({ description: '骑手 ID', nullable: true })
  riderId!: string | null

  @ApiProperty({ description: '类型 1/2/3/4' })
  type!: number

  @ApiProperty({ description: '原因编码' })
  reasonCode!: string

  @ApiProperty({ description: '原因描述', nullable: true })
  reasonDetail!: string | null

  @ApiProperty({ description: '证据图片数组', type: [String], nullable: true })
  evidenceUrls!: string[] | null

  @ApiProperty({ description: '申请退款金额（元，字符串）' })
  applyAmount!: string

  @ApiProperty({ description: '实际退款金额（元，字符串）', nullable: true })
  actualAmount!: string | null

  @ApiProperty({ description: '状态 0/10/20/30/40/50/60' })
  status!: number

  @ApiProperty({ description: '商户回复', nullable: true })
  merchantReply!: string | null

  @ApiProperty({ description: '商户回复时间', nullable: true })
  merchantReplyAt!: Date | null

  @ApiProperty({ description: '关联仲裁 ID', nullable: true })
  arbitrationId!: string | null

  @ApiProperty({ description: '处理管理员 ID', nullable: true })
  opAdminId!: string | null

  @ApiProperty({ description: '完成时间', nullable: true })
  finishAt!: Date | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}
