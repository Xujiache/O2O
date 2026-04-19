/**
 * @file user-point.dto.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc 用户积分 DTO：余额视图 / 流水查询 / 流水视图 / 管理端调整入参
 * @author 单 Agent V2.0（Agent C）
 *
 * 关键约束（与 07_marketing.sql 一致）：
 *   - direction：1 增加 / 2 扣减
 *   - biz_type：1 下单 / 2 评价 / 3 签到 / 4 邀请 / 5 兑换 / 6 过期 / 7 调整
 *   - point 字段为 int unsigned；不允许小数；正负差异由 direction 表达
 *   - 调整时 delta 可正可负；service 层自动拆 direction 与正向 point 值
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  NotEquals
} from 'class-validator'
import { PageQueryDto } from '@/common'

/**
 * 用户积分余额视图
 * 用途：GET /me/points
 */
export class PointBalanceVo {
  @ApiProperty({ description: '用户 ID' })
  userId!: string

  @ApiProperty({ description: '可用积分' })
  totalPoint!: number

  @ApiProperty({ description: '冻结积分（兑换处理中）' })
  frozenPoint!: number

  @ApiProperty({ description: '历史累计获得' })
  totalEarned!: number

  @ApiProperty({ description: '历史累计使用' })
  totalUsed!: number
}

/**
 * 管理端积分调整入参
 * 用途：POST /admin/users/:userId/points/adjust
 */
export class AdjustPointDto {
  @ApiProperty({
    description: '调整 delta（正：增加；负：扣减；不能为 0）',
    example: 100
  })
  @Type(() => Number)
  @IsInt({ message: 'delta 必须为整数' })
  @NotEquals(0, { message: 'delta 不能为 0' })
  delta!: number

  @ApiProperty({ description: '调整原因（必填，写入 user_point_flow.remark + OperationLog）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string

  @ApiPropertyOptional({ description: '关联业务单号（可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  relatedNo?: string
}

/**
 * 积分流水查询入参
 * 用途：GET /me/points/flows
 */
export class PointFlowQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: '业务类型筛选：1 下单 / 2 评价 / 3 签到 / 4 邀请 / 5 兑换 / 6 过期 / 7 调整'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3, 4, 5, 6, 7])
  bizType?: number

  @ApiPropertyOptional({ description: '方向筛选：1 增加 / 2 扣减' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  direction?: number
}

/**
 * 积分流水视图
 * 用途：GET /me/points/flows 列表元素
 */
export class PointFlowVo {
  @ApiProperty() id!: string
  @ApiProperty() userId!: string
  @ApiProperty({ description: '方向：1 增加 / 2 扣减' }) direction!: number
  @ApiProperty({
    description: '业务类型：1 下单 / 2 评价 / 3 签到 / 4 邀请 / 5 兑换 / 6 过期 / 7 调整'
  })
  bizType!: number
  @ApiProperty({ description: '本次发生积分（正数）' }) point!: number
  @ApiProperty({ description: '操作后余额' }) balanceAfter!: number
  @ApiProperty({ description: '关联业务单号', nullable: true }) relatedNo!: string | null
  @ApiProperty({ description: '该笔积分过期时间', nullable: true }) expireAt!: Date | null
  @ApiProperty({ description: '备注', nullable: true }) remark!: string | null
  @ApiProperty({ description: '操作管理员 ID', nullable: true }) opAdminId!: string | null
  @ApiProperty() createdAt!: Date
}
