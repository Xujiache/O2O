/**
 * @file dashboard.dto.ts
 * @stage P4/T4.43（Sprint 6）
 * @desc 运力看板 DTO（管理端）
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

/* ============================================================================
 * 1) 运力看板入参
 * ============================================================================ */

/**
 * 运力看板查询入参（按城市聚合）
 */
export class DashboardQueryDto {
  @ApiPropertyOptional({
    description: '城市编码（不传则汇总全部城市）',
    example: '110100'
  })
  @IsOptional()
  @IsString()
  cityCode?: string
}

/* ============================================================================
 * 2) 运力看板输出
 * ============================================================================ */

/**
 * 运力看板视图
 */
export class DashboardVo {
  @ApiProperty({ description: '城市编码（all 表示全部）', example: '110100' })
  cityCode!: string

  @ApiProperty({
    description: '在线骑手数（rider:online:{cityCode} ZCARD）',
    example: 128
  })
  onlineRiderCount!: number

  @ApiProperty({ description: '待派订单数（dispatch_record status=0）', example: 7 })
  pendingDispatchCount!: number

  @ApiProperty({
    description: '抢单池订单数（dispatch:grabpool:{cityCode} 集合大小）',
    example: 3
  })
  grabPoolCount!: number

  @ApiProperty({
    description: '配送中订单数（dispatch_record status=1 累计未送达）',
    example: 24
  })
  activeOrderCount!: number

  @ApiProperty({
    description: '近 1 小时平均接单耗时（秒；从派单到接受）',
    example: 8.5
  })
  avgAcceptDurationS!: number

  @ApiProperty({
    description: '近 1 小时派单成功率（接受 / 总派单）',
    example: 0.86
  })
  acceptRate!: number

  @ApiProperty({ description: '快照时间' })
  snapshotAt!: Date
}
