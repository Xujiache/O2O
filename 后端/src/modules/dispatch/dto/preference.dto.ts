/**
 * @file preference.dto.ts
 * @stage P4/T4.37（Sprint 6）
 * @desc 骑手接单偏好 DTO（GET / PUT /rider/preference）
 * @author 单 Agent V2.0（Subagent 5：Dispatch）
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayUnique, IsArray, IsInt, IsOptional, Max, Min } from 'class-validator'

/* ============================================================================
 * 1) 偏好视图（GET /rider/preference 返回）
 * ============================================================================ */

/**
 * 骑手偏好视图
 */
export class GetPreferenceVo {
  @ApiProperty({ description: '骑手 ID', example: '202604190000123' })
  riderId!: string

  @ApiProperty({
    description: '接单模式：1 系统派单 / 2 抢单 / 3 派单+抢单',
    example: 3
  })
  acceptMode!: number

  @ApiProperty({ description: '接单半径（米）', example: 3000 })
  acceptRadiusM!: number

  @ApiProperty({ description: '是否接外卖（0 否 / 1 是）', example: 1 })
  acceptTakeout!: number

  @ApiProperty({ description: '是否接跑腿（0 否 / 1 是）', example: 1 })
  acceptErrand!: number

  @ApiProperty({
    description: '接受的跑腿子类型数组（[1,2,3,4]）',
    example: [1, 2, 3, 4],
    nullable: true,
    isArray: true,
    type: Number
  })
  errandTypes!: number[] | null

  @ApiProperty({ description: '同时配送最大数', example: 5 })
  acceptMaxConcurrent!: number

  @ApiProperty({ description: '语音播报：0 关 / 1 开', example: 1 })
  voiceEnabled!: number
}

/* ============================================================================
 * 2) 更新偏好入参（PUT /rider/preference）
 * ============================================================================ */

/**
 * 更新偏好入参
 */
export class UpdatePreferenceDto {
  @ApiPropertyOptional({
    description: '接单模式：1 系统派单 / 2 抢单 / 3 派单+抢单',
    example: 3,
    enum: [1, 2, 3]
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  acceptMode?: number

  @ApiPropertyOptional({
    description: '接单半径（米）',
    example: 3000,
    minimum: 500,
    maximum: 10000
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(10000)
  acceptRadiusM?: number

  @ApiPropertyOptional({ description: '是否接外卖（0 否 / 1 是）', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  acceptTakeout?: number

  @ApiPropertyOptional({ description: '是否接跑腿（0 否 / 1 是）', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  acceptErrand?: number

  @ApiPropertyOptional({
    description: '接受的跑腿子类型数组（[1,2,3,4]）',
    example: [1, 2, 3, 4],
    isArray: true,
    type: Number
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(4, { each: true })
  errandTypes?: number[]

  @ApiPropertyOptional({
    description: '同时配送最大数',
    example: 5,
    minimum: 1,
    maximum: 20
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  acceptMaxConcurrent?: number

  @ApiPropertyOptional({ description: '语音播报：0 关 / 1 开', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  voiceEnabled?: number
}
