/**
 * @file ticket.dto.ts
 * @stage P4/T4.46（Sprint 7）
 * @desc 客服工单 DTO：用户/商户/骑手提交求助 + admin 分派 / 回复 / 关闭 + 视图对象
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 字段语义对齐 08_review.sql 第 6 张表 ticket：
 *   - submitter_type 1 用户 / 2 商户 / 3 骑手（service 注入；DTO 不暴露）
 *   - priority       1 低 / 2 中 / 3 高 / 4 紧急
 *   - status         0 待受理 / 1 处理中 / 2 已解决 / 3 已关闭 / 4 已转单
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
 * 1) 创建工单
 * ============================================================================ */

/** 工单优先级可选值 */
export const TICKET_PRIORITIES = [1, 2, 3, 4] as const

/**
 * 创建工单入参
 * 用途：POST /me/tickets / POST /merchant/tickets / POST /rider/tickets
 *
 * 注：submitterType / submitterId 由 controller 端类型注入；priority 默认 1 低
 */
export class CreateTicketDto {
  @ApiProperty({
    description: '工单分类（→ sys_dict ticket_category，例 help / consult / refund_query）',
    example: 'help',
    maxLength: 64
  })
  @IsString()
  @Length(1, 64)
  category!: string

  @ApiProperty({ description: '工单标题（1~255 字）' })
  @IsString()
  @Length(1, 255)
  title!: string

  @ApiProperty({ description: '工单内容（≤ 10000 字）' })
  @IsString()
  @MaxLength(10000)
  content!: string

  @ApiPropertyOptional({
    description: '附件 URL 数组（最多 9 张）',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  attachUrls?: string[]

  @ApiPropertyOptional({ description: '关联订单号' })
  @IsOptional()
  @IsString()
  @Length(1, 18)
  relatedOrderNo?: string

  @ApiPropertyOptional({ description: '关联订单类型：1 外卖 / 2 跑腿' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  relatedType?: number

  @ApiPropertyOptional({
    description: '优先级：1 低 / 2 中 / 3 高 / 4 紧急（默认 1）',
    enum: TICKET_PRIORITIES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(TICKET_PRIORITIES as unknown as number[])
  priority?: number
}

/* ============================================================================
 * 2) 管理端 分派 / 回复 / 关闭
 * ============================================================================ */

/** 分派工单入参 */
export class AssignTicketDto {
  @ApiProperty({ description: '指派的客服 admin 主键', example: '7203456789012345678' })
  @IsString()
  @Length(1, 32)
  assigneeAdminId!: string

  @ApiPropertyOptional({
    description: '分派时调整优先级（1/2/3/4），不传则保持原值'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(TICKET_PRIORITIES as unknown as number[])
  priority?: number
}

/** 回复工单入参 */
export class ReplyTicketDto {
  @ApiProperty({ description: '回复内容（1~2000 字）' })
  @IsString()
  @Length(1, 2000)
  content!: string

  @ApiPropertyOptional({
    description: '附件 URL 数组（最多 9 张）',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  attachUrls?: string[]
}

/** 关闭工单入参 */
export class CloseTicketDto {
  @ApiProperty({ description: '关闭原因/总结（1~500 字）' })
  @IsString()
  @Length(1, 500)
  closeReason!: string
}

/* ============================================================================
 * 3) 列表查询
 * ============================================================================ */

/** 工单状态可选值 */
export const TICKET_STATUSES = [0, 1, 2, 3, 4] as const

/** 工单查询入参 */
export class QueryTicketDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '状态：0/1/2/3/4', enum: TICKET_STATUSES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(TICKET_STATUSES as unknown as number[])
  status?: number

  @ApiPropertyOptional({ description: '提交方：1 用户 / 2 商户 / 3 骑手' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  submitterType?: number

  @ApiPropertyOptional({ description: '提交方 ID（管理端可指定）' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  submitterId?: string

  @ApiPropertyOptional({ description: '指派客服 ID' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  assigneeAdminId?: string

  @ApiPropertyOptional({ description: '类别' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  category?: string

  @ApiPropertyOptional({ description: '优先级 1/2/3/4' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(TICKET_PRIORITIES as unknown as number[])
  priority?: number

  @ApiPropertyOptional({ description: '关联订单号' })
  @IsOptional()
  @IsString()
  @Length(1, 18)
  relatedOrderNo?: string
}

/* ============================================================================
 * 4) TicketVo
 * ============================================================================ */

/** 工单视图对象 */
export class TicketVo {
  @ApiProperty({ description: '工单主键' })
  id!: string

  @ApiProperty({ description: '工单号' })
  ticketNo!: string

  @ApiProperty({ description: '提交方：1 用户 / 2 商户 / 3 骑手' })
  submitterType!: number

  @ApiProperty({ description: '提交方 ID' })
  submitterId!: string

  @ApiProperty({ description: '工单分类' })
  category!: string

  @ApiProperty({ description: '优先级 1/2/3/4' })
  priority!: number

  @ApiProperty({ description: '工单标题' })
  title!: string

  @ApiProperty({ description: '工单内容' })
  content!: string

  @ApiProperty({ description: '附件 URL 数组', type: [String], nullable: true })
  attachUrls!: string[] | null

  @ApiProperty({ description: '关联订单号', nullable: true })
  relatedOrderNo!: string | null

  @ApiProperty({ description: '关联订单类型 1/2', nullable: true })
  relatedType!: number | null

  @ApiProperty({ description: '状态 0/1/2/3/4' })
  status!: number

  @ApiProperty({ description: '指派管理员 ID', nullable: true })
  assigneeAdminId!: string | null

  @ApiProperty({ description: '最后回复时间', nullable: true })
  lastReplyAt!: Date | null

  @ApiProperty({ description: '最后回复方 1 提交方 / 2 客服', nullable: true })
  lastReplyByType!: number | null

  @ApiProperty({ description: '关闭时间', nullable: true })
  closedAt!: Date | null

  @ApiProperty({ description: '关闭原因/总结', nullable: true })
  closeReason!: string | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}
