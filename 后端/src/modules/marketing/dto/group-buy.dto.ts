/**
 * @file group-buy.dto.ts
 * @stage P4/T4.11（Sprint 2）
 * @desc 拼单 DTO：加入拼单 / 我的拼单 + 拼单视图
 * @author 单 Agent V2.0
 *
 * 拼单状态：
 *   - pending  进行中（Set 计数 < groupSize）
 *   - success  已成团（Set 计数 == groupSize）
 *   - failed   已超时 / 已关闭
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator'

/** 拼单状态枚举（字面量字符串） */
export const GROUP_BUY_STATUSES = ['pending', 'success', 'failed'] as const
export type GroupBuyStatus = (typeof GROUP_BUY_STATUSES)[number]

/**
 * 加入拼单入参
 * 用途：POST /promotions/:id/join-group
 *
 * 设计：groupNo 可选；不传则服务端自动开新团；传则尝试加入既有团
 */
export class JoinGroupDto {
  @ApiPropertyOptional({
    description: '团号（不传则服务端开新团）',
    example: 'G2026041900012'
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  groupNo?: string
}

/**
 * 我的拼单查询入参
 * 用途：GET /me/group-buys
 */
export class QueryMyGroupBuyDto {
  @ApiPropertyOptional({
    description: '状态过滤：pending / success / failed（不传 = 全部）',
    enum: GROUP_BUY_STATUSES
  })
  @IsOptional()
  @IsString()
  @IsIn(GROUP_BUY_STATUSES as unknown as string[])
  status?: GroupBuyStatus

  @ApiPropertyOptional({ description: '最大返回条数（默认 50，最大 200）', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number
}

/**
 * 拼单视图（join 接口与列表共用）
 */
export class GroupBuyVo {
  @ApiProperty({ description: '活动主键' }) promotionId!: string
  @ApiProperty({ description: '团号' }) groupNo!: string
  @ApiProperty({ description: '当前已加入人数' }) currentSize!: number
  @ApiProperty({ description: '成团人数' }) groupSize!: number
  @ApiProperty({
    description: '状态：pending 进行中 / success 已成团 / failed 已超时或失败',
    enum: GROUP_BUY_STATUSES
  })
  status!: GroupBuyStatus
  @ApiProperty({ description: '本团每人减免金额（元，字符串）', example: '2.00' })
  discountPerHead!: string
  @ApiProperty({ description: '团内成员 userId 列表（仅本人加入时返回完整）', isArray: true })
  participants!: string[]
  @ApiProperty({ description: '过期时间（ISO 8601；可能为 null 表示已结束）', nullable: true })
  expireAt!: Date | null
}
