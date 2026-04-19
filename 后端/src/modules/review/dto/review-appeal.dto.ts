/**
 * @file review-appeal.dto.ts
 * @stage P4/T4.45（Sprint 7）
 * @desc 评价申诉 DTO：商户/骑手提交申诉 + admin 审核 + 视图对象
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 字段语义对齐 08_review.sql 第 3 张表 review_appeal：
 *   - appellant_type  1 商户 / 2 骑手（service 层按 controller 端类型注入；DTO 不暴露）
 *   - status          0 申诉中 / 1 通过 / 2 驳回
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
 * 1) 提交申诉（商户/骑手共用；appellant_type 由 controller 端类型注入）
 * ============================================================================ */

/**
 * 创建申诉入参
 * 用途：
 *   - POST /merchant/reviews/:id/appeal（appellantType=1，appellantId=merchantId）
 *   - POST /rider/reviews/:id/appeal   （appellantType=2，appellantId=riderId）
 */
export class CreateAppealDto {
  @ApiProperty({
    description: '申诉理由编码（如 customer_misunderstand / fact_distortion 等运营字典）',
    example: 'customer_misunderstand',
    maxLength: 64
  })
  @IsString()
  @Length(1, 64)
  reasonCode!: string

  @ApiProperty({
    description: '申诉详情（1~1000 字）',
    example: '该订单送达时间在合理范围内，骑手已按客户要求放门口'
  })
  @IsString()
  @Length(1, 1000)
  reasonDetail!: string

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
}

/* ============================================================================
 * 2) 管理端审核（pass / reject）
 * ============================================================================ */

/** 申诉审核动作字面量（DTO 校验用） */
export const APPEAL_AUDIT_ACTIONS = ['pass', 'reject'] as const

/** 审核申诉入参 */
export class AuditAppealDto {
  @ApiProperty({
    description: '审核动作：pass 通过（review.is_hidden=1）/ reject 驳回',
    enum: APPEAL_AUDIT_ACTIONS,
    example: 'pass'
  })
  @IsString()
  @IsIn(APPEAL_AUDIT_ACTIONS as unknown as string[])
  action!: 'pass' | 'reject'

  @ApiProperty({
    description: '审核备注（1~500 字；驳回必填理由）',
    example: '证据充分，差评隐藏'
  })
  @IsString()
  @Length(1, 500)
  remark!: string
}

/* ============================================================================
 * 3) 列表查询
 * ============================================================================ */

/** 申诉状态可选值 */
export const APPEAL_STATUSES = [0, 1, 2] as const

/** 申诉列表查询入参 */
export class QueryAppealDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: '状态：0 申诉中 / 1 通过 / 2 驳回',
    enum: APPEAL_STATUSES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(APPEAL_STATUSES as unknown as number[])
  status?: number

  @ApiPropertyOptional({ description: '申诉方：1 商户 / 2 骑手' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  appellantType?: number

  @ApiPropertyOptional({ description: '申诉方 ID' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  appellantId?: string

  @ApiPropertyOptional({ description: '原评价 ID' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  reviewId?: string
}

/* ============================================================================
 * 4) AppealVo
 * ============================================================================ */

/** 申诉视图对象 */
export class AppealVo {
  @ApiProperty({ description: '申诉主键' })
  id!: string

  @ApiProperty({ description: '被申诉评价 ID' })
  reviewId!: string

  @ApiProperty({ description: '申诉方：1 商户 / 2 骑手' })
  appellantType!: number

  @ApiProperty({ description: '申诉方 ID' })
  appellantId!: string

  @ApiProperty({ description: '申诉理由编码' })
  reasonCode!: string

  @ApiProperty({ description: '申诉详情' })
  reasonDetail!: string

  @ApiProperty({ description: '证据图片 URL 数组', type: [String], nullable: true })
  evidenceUrls!: string[] | null

  @ApiProperty({ description: '状态：0 申诉中 / 1 通过 / 2 驳回' })
  status!: number

  @ApiProperty({ description: '审核管理员 ID', nullable: true })
  auditAdminId!: string | null

  @ApiProperty({ description: '审核时间', nullable: true })
  auditAt!: Date | null

  @ApiProperty({ description: '审核备注', nullable: true })
  auditRemark!: string | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}
