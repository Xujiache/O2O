/**
 * @file arbitration.dto.ts
 * @stage P4/T4.47（Sprint 7）
 * @desc 仲裁 DTO：主动申请 + admin 裁决 + 视图对象
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 字段语义对齐 08_review.sql 第 5 张表 arbitration：
 *   - source_type     1 售后转 / 2 投诉转 / 3 主动申请
 *   - applicant_type  1 用户 / 2 商户 / 3 骑手
 *   - respondent_type 同上
 *   - status          0 待审 / 1 审理中 / 2 已裁决 / 3 已关闭
 *   - decision        1 申请方胜 / 2 被申请方胜 / 3 部分支持 / 4 驳回
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
 * 1) 主动申请仲裁（source_type=3，sourceId 自填生成）
 * ============================================================================ */

/** 申请方/被申请方枚举 */
export const ARBITRATION_PARTY_TYPES = [1, 2, 3] as const
/** 仲裁来源枚举（用户层仅 source_type=3 主动申请；售后/投诉转的由 service 内部触发） */
export const ARBITRATION_SOURCE_TYPES = [1, 2, 3] as const

/**
 * 主动申请仲裁入参
 * 用途：POST /me/arbitrations（用户）或商户/骑手主动申请
 *
 * 注：source_type 固定 3 由 service 注入；applicantType/applicantId 由 controller 端类型注入
 */
export class CreateArbitrationDto {
  @ApiProperty({ description: '关联订单号', example: 'D202604190100000123' })
  @IsString()
  @Length(18, 18)
  orderNo!: string

  @ApiProperty({ description: '订单类型：1 外卖 / 2 跑腿', enum: [1, 2] })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  orderType!: number

  @ApiProperty({
    description: '被申请方：1 用户 / 2 商户 / 3 骑手',
    enum: ARBITRATION_PARTY_TYPES
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(ARBITRATION_PARTY_TYPES as unknown as number[])
  respondentType!: number

  @ApiProperty({ description: '被申请方 ID' })
  @IsString()
  @Length(1, 32)
  respondentId!: string

  @ApiPropertyOptional({ description: '争议金额（元，字符串）', example: '50.00' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'disputeAmount 必须为最多 2 位小数' })
  disputeAmount?: string

  @ApiProperty({ description: '争议描述（1~2000 字）' })
  @IsString()
  @Length(1, 2000)
  disputeContent!: string

  @ApiPropertyOptional({
    description: '证据 URL 数组（最多 9 张）',
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
 * 2) 管理端 裁决
 * ============================================================================ */

/** 裁决结果可选值 */
export const ARBITRATION_DECISIONS = [1, 2, 3, 4] as const

/**
 * 裁决入参
 * 用途：POST /admin/arbitrations/:id/judge
 *
 * 业务规则（service 实现）：
 *   - decision=1 申请方胜：若申请方=用户 + decision_amount>0 → 触发退款（payNo 来自订单）
 *   - decision=3 部分支持：同上但金额可低于 dispute_amount
 *   - decision=2/4：不退款
 *   - 同步更新关联 source（after_sale / complaint）状态为已结案
 */
export class JudgeArbitrationDto {
  @ApiProperty({
    description: '裁决结果：1 申请方胜 / 2 被申请方胜 / 3 部分支持 / 4 驳回',
    enum: ARBITRATION_DECISIONS,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(ARBITRATION_DECISIONS as unknown as number[])
  decision!: number

  @ApiPropertyOptional({
    description: '裁决金额（元，字符串；申请方胜 / 部分支持时填）',
    example: '50.00'
  })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'decisionAmount 必须为最多 2 位小数' })
  decisionAmount?: string

  @ApiProperty({ description: '裁决详情（1~2000 字）' })
  @IsString()
  @Length(1, 2000)
  decisionDetail!: string
}

/* ============================================================================
 * 3) 列表查询
 * ============================================================================ */

/** 仲裁状态可选值 */
export const ARBITRATION_STATUSES = [0, 1, 2, 3] as const

/** 仲裁查询入参 */
export class QueryArbitrationDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '状态：0/1/2/3', enum: ARBITRATION_STATUSES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(ARBITRATION_STATUSES as unknown as number[])
  status?: number

  @ApiPropertyOptional({
    description: '来源：1 售后转 / 2 投诉转 / 3 主动申请',
    enum: ARBITRATION_SOURCE_TYPES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(ARBITRATION_SOURCE_TYPES as unknown as number[])
  sourceType?: number

  @ApiPropertyOptional({ description: '申请方：1/2/3' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(ARBITRATION_PARTY_TYPES as unknown as number[])
  applicantType?: number

  @ApiPropertyOptional({ description: '申请方 ID' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  applicantId?: string

  @ApiPropertyOptional({ description: '被申请方：1/2/3' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(ARBITRATION_PARTY_TYPES as unknown as number[])
  respondentType?: number

  @ApiPropertyOptional({ description: '被申请方 ID' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  respondentId?: string

  @ApiPropertyOptional({ description: '关联订单号' })
  @IsOptional()
  @IsString()
  @Length(1, 18)
  orderNo?: string
}

/* ============================================================================
 * 4) ArbitrationVo
 * ============================================================================ */

/** 仲裁视图对象 */
export class ArbitrationVo {
  @ApiProperty({ description: '仲裁主键' })
  id!: string

  @ApiProperty({ description: '仲裁单号' })
  arbitrationNo!: string

  @ApiProperty({ description: '来源 1 售后转 / 2 投诉转 / 3 主动申请' })
  sourceType!: number

  @ApiProperty({ description: '来源 ID（after_sale.id / complaint.id；主动申请时为占位）' })
  sourceId!: string

  @ApiProperty({ description: '关联订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型 1 外卖 / 2 跑腿' })
  orderType!: number

  @ApiProperty({ description: '申请方类型 1/2/3' })
  applicantType!: number

  @ApiProperty({ description: '申请方 ID' })
  applicantId!: string

  @ApiProperty({ description: '被申请方类型 1/2/3' })
  respondentType!: number

  @ApiProperty({ description: '被申请方 ID' })
  respondentId!: string

  @ApiProperty({ description: '争议金额（元，字符串）', nullable: true })
  disputeAmount!: string | null

  @ApiProperty({ description: '争议描述' })
  disputeContent!: string

  @ApiProperty({ description: '证据 URL 数组', type: [String], nullable: true })
  evidenceUrls!: string[] | null

  @ApiProperty({ description: '状态 0/1/2/3' })
  status!: number

  @ApiProperty({ description: '裁决结果 1/2/3/4', nullable: true })
  decision!: number | null

  @ApiProperty({ description: '裁决金额（元，字符串）', nullable: true })
  decisionAmount!: string | null

  @ApiProperty({ description: '裁决详情', nullable: true })
  decisionDetail!: string | null

  @ApiProperty({ description: '主审管理员 ID', nullable: true })
  judgeAdminId!: string | null

  @ApiProperty({ description: '裁决时间', nullable: true })
  decisionAt!: Date | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}
