/**
 * @file complaint.dto.ts
 * @stage P4/T4.46（Sprint 7）
 * @desc 投诉 DTO：用户/商户/骑手提交投诉 + admin 处理 / 升级仲裁 + 视图对象
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 字段语义对齐 08_review.sql 第 4 张表 complaint：
 *   - complainant_type 1 用户 / 2 商户 / 3 骑手（service 注入；DTO 不暴露）
 *   - target_type      1 用户 / 2 商户 / 3 骑手 / 4 平台
 *   - severity         1 一般 / 2 中等 / 3 严重
 *   - status           0 待处理 / 1 处理中 / 2 已解决 / 3 已关闭 / 4 转仲裁
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength
} from 'class-validator'
import { PageQueryDto } from '@/common'

/* ============================================================================
 * 1) 创建投诉
 * ============================================================================ */

/** 被投诉对象类型可选值 */
export const COMPLAINT_TARGET_TYPES = [1, 2, 3, 4] as const
/** 严重等级可选值 */
export const COMPLAINT_SEVERITIES = [1, 2, 3] as const

/**
 * 创建投诉入参
 * 用途：POST /me/complaints（用户）/ POST /merchant/complaints / POST /rider/complaints
 *
 * 注：complainantType / complainantId 由 controller 端类型注入，DTO 不暴露
 */
export class CreateComplaintDto {
  @ApiProperty({
    description: '被投诉对象：1 用户 / 2 商户 / 3 骑手 / 4 平台',
    enum: COMPLAINT_TARGET_TYPES,
    example: 2
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(COMPLAINT_TARGET_TYPES as unknown as number[])
  targetType!: number

  @ApiPropertyOptional({
    description: '被投诉对象 ID（targetType=4 平台时不传 / 传 null）'
  })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  targetId?: string

  @ApiPropertyOptional({ description: '关联订单号（可空）' })
  @IsOptional()
  @IsString()
  @Length(1, 18)
  orderNo?: string

  @ApiPropertyOptional({ description: '订单类型：1 外卖 / 2 跑腿（与 orderNo 同传）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  orderType?: number

  @ApiProperty({
    description:
      '投诉类别（→ sys_dict complaint_category，例 service_attitude / quality / hygiene）',
    example: 'service_attitude'
  })
  @IsString()
  @Length(1, 64)
  category!: string

  @ApiProperty({ description: '投诉内容（1~2000 字）' })
  @IsString()
  @Length(1, 2000)
  content!: string

  @ApiPropertyOptional({
    description: '证据图片/视频 URL 数组（最多 9 张）',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  evidenceUrls?: string[]

  @ApiPropertyOptional({
    description: '严重等级：1 一般 / 2 中等 / 3 严重（默认 1）',
    enum: COMPLAINT_SEVERITIES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COMPLAINT_SEVERITIES as unknown as number[])
  severity?: number
}

/* ============================================================================
 * 2) 管理端处理 / 升级仲裁
 * ============================================================================ */

/** 投诉处理动作字面量 */
export const COMPLAINT_HANDLE_ACTIONS = ['resolve', 'close'] as const

/** 处理投诉入参（resolve / close 共用） */
export class HandleComplaintDto {
  @ApiProperty({
    description: '动作：resolve 解决（status→2）/ close 关闭（status→3）',
    enum: COMPLAINT_HANDLE_ACTIONS,
    example: 'resolve'
  })
  @IsString()
  @IsIn(COMPLAINT_HANDLE_ACTIONS as unknown as string[])
  action!: 'resolve' | 'close'

  @ApiProperty({ description: '处理结果（1~2000 字）' })
  @IsString()
  @Length(1, 2000)
  handleResult!: string
}

/** 升级仲裁入参（complaint → arbitration） */
export class EscalateComplaintDto {
  @ApiProperty({
    description: '申请方：1 用户 / 2 商户 / 3 骑手（默认取投诉方）',
    enum: [1, 2, 3]
  })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  applicantType!: number

  @ApiProperty({ description: '申请方 ID', example: '7203456789012345678' })
  @IsString()
  @Length(1, 32)
  applicantId!: string

  @ApiProperty({
    description: '被申请方：1 用户 / 2 商户 / 3 骑手（默认取被投诉方）',
    enum: [1, 2, 3]
  })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  respondentType!: number

  @ApiProperty({ description: '被申请方 ID', example: '7203456789012345679' })
  @IsString()
  @Length(1, 32)
  respondentId!: string

  @ApiPropertyOptional({ description: '争议金额（元，字符串）', example: '50.00' })
  @IsOptional()
  @IsString()
  @Length(1, 16)
  disputeAmount?: string

  @ApiProperty({ description: '争议描述（1~2000 字）' })
  @IsString()
  @Length(1, 2000)
  disputeContent!: string
}

/* ============================================================================
 * 3) 列表查询
 * ============================================================================ */

/** 投诉状态可选值 */
export const COMPLAINT_STATUSES = [0, 1, 2, 3, 4] as const

/** 投诉列表查询入参 */
export class QueryComplaintDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '状态：0/1/2/3/4', enum: COMPLAINT_STATUSES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COMPLAINT_STATUSES as unknown as number[])
  status?: number

  @ApiPropertyOptional({ description: '严重等级：1/2/3' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COMPLAINT_SEVERITIES as unknown as number[])
  severity?: number

  @ApiPropertyOptional({ description: '投诉方：1 用户 / 2 商户 / 3 骑手' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  complainantType?: number

  @ApiPropertyOptional({ description: '投诉方 ID（管理端可指定）' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  complainantId?: string

  @ApiPropertyOptional({ description: '被投诉对象类型 1/2/3/4' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(COMPLAINT_TARGET_TYPES as unknown as number[])
  targetType?: number

  @ApiPropertyOptional({ description: '被投诉对象 ID' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  targetId?: string

  @ApiPropertyOptional({ description: '关联订单号' })
  @IsOptional()
  @IsString()
  @Length(1, 18)
  orderNo?: string

  @ApiPropertyOptional({ description: '类别' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  category?: string
}

/* ============================================================================
 * 4) ComplaintVo
 * ============================================================================ */

/** 投诉视图对象 */
export class ComplaintVo {
  @ApiProperty({ description: '投诉主键' })
  id!: string

  @ApiProperty({ description: '投诉单号' })
  complaintNo!: string

  @ApiProperty({ description: '投诉方：1 用户 / 2 商户 / 3 骑手' })
  complainantType!: number

  @ApiProperty({ description: '投诉方 ID' })
  complainantId!: string

  @ApiProperty({ description: '被投诉对象类型 1/2/3/4' })
  targetType!: number

  @ApiProperty({ description: '被投诉对象 ID', nullable: true })
  targetId!: string | null

  @ApiProperty({ description: '关联订单号', nullable: true })
  orderNo!: string | null

  @ApiProperty({ description: '订单类型 1 外卖 / 2 跑腿', nullable: true })
  orderType!: number | null

  @ApiProperty({ description: '投诉类别' })
  category!: string

  @ApiProperty({ description: '投诉内容' })
  content!: string

  @ApiProperty({ description: '证据 URL 数组', type: [String], nullable: true })
  evidenceUrls!: string[] | null

  @ApiProperty({ description: '严重等级 1/2/3' })
  severity!: number

  @ApiProperty({ description: '状态 0/1/2/3/4' })
  status!: number

  @ApiProperty({ description: '处理管理员 ID', nullable: true })
  handleAdminId!: string | null

  @ApiProperty({ description: '处理时间', nullable: true })
  handleAt!: Date | null

  @ApiProperty({ description: '处理结果', nullable: true })
  handleResult!: string | null

  @ApiProperty({ description: '关联仲裁 ID', nullable: true })
  arbitrationId!: string | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}
