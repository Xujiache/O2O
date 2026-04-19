/**
 * @file dispatch.dto.ts
 * @stage P4/T4.36~T4.40（Sprint 6）
 * @desc Dispatch 模块对外 DTO（VO + 入参 + 列表查询）
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 *
 * 涉及对象：
 *   - DispatchRecordVo       派单记录视图
 *   - RiderCandidateVo       候选骑手视图（管理后台调试用）
 *   - GrabResultDto          抢单返回
 *   - DispatchListQueryDto   抢单池 / 派单记录列表查询
 *   - ManualDispatchDto      管理后台强制指派
 *   - RejectDispatchDto      骑手拒单
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min } from 'class-validator'
import { PageQueryDto } from '@/common'

/* ============================================================================
 * 1) 派单记录 VO
 * ============================================================================ */

/**
 * 派单记录视图
 * 用途：管理后台 GET /admin/dispatches、骑手端 GET /rider/dispatch/list 返回
 */
export class DispatchRecordVo {
  @ApiProperty({ description: '派单记录主键', example: '20260419120000001' })
  id!: string

  @ApiProperty({ description: '订单号', example: 'T2026041910000001' })
  orderNo!: string

  @ApiProperty({ description: '订单类型：1 外卖 / 2 跑腿', example: 1 })
  orderType!: number

  @ApiProperty({ description: '派单模式：1 系统 / 2 抢单 / 3 人工', example: 1 })
  dispatchMode!: number

  @ApiProperty({
    description: '目标骑手 ID（抢单池阶段为 null）',
    example: '202604190000123',
    nullable: true
  })
  riderId!: string | null

  @ApiProperty({
    description: '匹配分数（DECIMAL(8,4) 字符串）',
    example: '85.4321',
    nullable: true
  })
  score!: string | null

  @ApiProperty({ description: '骑手到取件点距离（米）', example: 1234, nullable: true })
  distanceM!: number | null

  @ApiProperty({ description: '状态：0 派单中 / 1 接受 / 2 拒绝 / 3 超时 / 4 取消', example: 0 })
  status!: number

  @ApiProperty({ description: '骑手接受时间', example: null, nullable: true })
  acceptedAt!: Date | null

  @ApiProperty({ description: '骑手应答时间', example: null, nullable: true })
  respondedAt!: Date | null

  @ApiProperty({ description: '拒绝原因', example: null, nullable: true })
  rejectReason!: string | null

  @ApiProperty({ description: '应答超时时间', example: null, nullable: true })
  expireAt!: Date | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date
}

/* ============================================================================
 * 2) 候选骑手 VO（管理后台调试 / 看板）
 * ============================================================================ */

/**
 * 候选骑手视图（管理后台诊断派单决策时返回）
 */
export class RiderCandidateVo {
  @ApiProperty({ description: '骑手 ID', example: '202604190000123' })
  riderId!: string

  @ApiProperty({ description: '当前经度', example: 116.4806 })
  lng!: number

  @ApiProperty({ description: '当前纬度', example: 39.9938 })
  lat!: number

  @ApiProperty({ description: '到取件点距离（公里）', example: 1.23 })
  distanceKm!: number

  @ApiProperty({ description: '到取件点距离（米）', example: 1234 })
  distanceM!: number

  @ApiProperty({ description: '当前进行中订单数', example: 2 })
  currentOrders!: number

  @ApiProperty({ description: '最大并发配送数', example: 5 })
  maxConcurrent!: number

  @ApiProperty({ description: '骑手评分（0~5）', example: 4.8 })
  riderScore!: number

  @ApiPropertyOptional({ description: '本次评分得分', example: 85.4321 })
  finalScore?: number
}

/* ============================================================================
 * 3) 抢单结果 DTO
 * ============================================================================ */

/**
 * 抢单结果
 */
export class GrabResultDto {
  @ApiProperty({ description: '抢单是否成功', example: true })
  success!: boolean

  @ApiProperty({ description: '订单号', example: 'T2026041910000001' })
  orderNo!: string

  @ApiProperty({ description: '骑手 ID', example: '202604190000123' })
  riderId!: string

  @ApiPropertyOptional({ description: '派单记录 ID（成功时返回）', example: '20260419120000001' })
  dispatchRecordId?: string

  @ApiPropertyOptional({ description: '抢单时间', example: '2026-04-19T12:00:00.000Z' })
  grabbedAt?: Date

  @ApiPropertyOptional({ description: '失败原因（订单已被抢 / 状态非法）' })
  reason?: string
}

/* ============================================================================
 * 4) 列表查询 / 入参
 * ============================================================================ */

/**
 * 抢单池 / 派单记录列表查询
 */
export class DispatchListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '订单类型：1 外卖 / 2 跑腿', enum: [1, 2] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  orderType?: number

  @ApiPropertyOptional({ description: '城市编码（GEO 维度）', example: '110100' })
  @IsOptional()
  @IsString()
  cityCode?: string

  @ApiPropertyOptional({ description: '派单状态：0 派单中 / 1 接受 / 2 拒绝 / 3 超时 / 4 取消' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  status?: number

  @ApiPropertyOptional({ description: '订单号模糊查询', example: 'T2026' })
  @IsOptional()
  @IsString()
  orderNo?: string

  @ApiPropertyOptional({ description: '骑手 ID 精确查询' })
  @IsOptional()
  @IsString()
  riderId?: string
}

/**
 * 管理后台强制指派
 */
export class ManualDispatchDto {
  @ApiProperty({ description: '强制指派的骑手 ID', example: '202604190000123' })
  @IsString()
  @IsNotEmpty()
  riderId!: string

  @ApiPropertyOptional({ description: '指派原因', example: '抢单池超时无人接' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  reason?: string
}

/**
 * 拒单入参
 */
export class RejectDispatchDto {
  @ApiProperty({ description: '拒绝原因（必填）', example: '我已经在配送其他订单' })
  @IsString()
  @IsNotEmpty({ message: '拒单原因不可为空' })
  @Length(1, 255, { message: '拒单原因 1~255 字符' })
  reason!: string
}
