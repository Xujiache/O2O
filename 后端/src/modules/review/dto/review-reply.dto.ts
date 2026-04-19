/**
 * @file review-reply.dto.ts
 * @stage P4/T4.44（Sprint 7）
 * @desc 评价回复 DTO：商户/平台官方回复 + 视图对象
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 字段语义对齐 08_review.sql 第 2 张表 review_reply：
 *   - replier_type 1 商户 / 2 平台官方
 *   - 回复内容 ≤ 1000 字
 */

import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'

/* ============================================================================
 * 1) 创建回复（商户 / 平台官方共用）
 * ============================================================================ */

/**
 * 创建回复入参
 * 用途：
 *   - POST /merchant/reviews/:id/reply（商户回复，replierType=1，replierId=merchantId）
 *   - POST /admin/reviews/:id/reply  （平台官方回复，replierType=2，replierId=adminId）
 */
export class CreateReplyDto {
  @ApiProperty({ description: '回复内容（1~1000 字）', example: '感谢支持，欢迎再次光临！' })
  @IsString()
  @Length(1, 1000, { message: 'content 长度必须 1~1000 字' })
  content!: string
}

/* ============================================================================
 * 2) ReplyVo
 * ============================================================================ */

/** 回复视图对象 */
export class ReplyVo {
  @ApiProperty({ description: '回复主键' })
  id!: string

  @ApiProperty({ description: '原评价 ID' })
  reviewId!: string

  @ApiProperty({ description: '回复方：1 商户 / 2 平台官方' })
  replierType!: number

  @ApiProperty({ description: '回复方 ID（merchant_staff.id 或 admin.id）' })
  replierId!: string

  @ApiProperty({ description: '回复内容' })
  content!: string

  @ApiProperty({ description: '是否隐藏 0/1' })
  isHidden!: number

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}
