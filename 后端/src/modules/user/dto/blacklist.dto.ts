/**
 * @file blacklist.dto.ts
 * @stage P3 / T3.12
 * @desc 黑名单 DTO（封禁/解封）
 * @author 员工 B
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator'
import { PageQueryDto } from '../../../common'

/**
 * 加入黑名单 DTO
 * 用途：POST /api/v1/admin/blacklist
 */
export class AddBlacklistDto {
  @ApiProperty({ description: '主体类型：1 用户/2 商户/3 骑手/4 设备/5 IP', example: 1 })
  @IsInt()
  @IsIn([1, 2, 3, 4, 5])
  targetType!: number

  @ApiPropertyOptional({ description: '主体 ID（用户/商户/骑手时必传，雪花字符串）' })
  @IsOptional()
  @IsString()
  targetId?: string

  @ApiPropertyOptional({ description: '主体值（设备号/IP/手机号 hash）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  targetValue?: string

  @ApiProperty({ description: '加入原因' })
  @IsString()
  @MaxLength(255)
  reason!: string

  @ApiPropertyOptional({ description: '证据附件 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  evidenceUrl?: string

  @ApiPropertyOptional({ description: '严重等级：1 警告/2 限制/3 永久封禁', example: 2 })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3])
  level?: number

  @ApiPropertyOptional({ description: '过期时间（不传=永久）' })
  @IsOptional()
  @IsDateString()
  expireAt?: string
}

/**
 * 黑名单列表查询
 */
export class ListBlacklistQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '主体类型筛选' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3, 4, 5])
  targetType?: number

  @ApiPropertyOptional({ description: '状态：0 已解除/1 生效中', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number
}

/**
 * 黑名单视图
 */
export class BlacklistVo {
  @ApiProperty() id!: string
  @ApiProperty() targetType!: number
  @ApiProperty({ nullable: true }) targetId!: string | null
  @ApiProperty({ nullable: true }) targetValue!: string | null
  @ApiProperty() reason!: string
  @ApiProperty({ nullable: true }) evidenceUrl!: string | null
  @ApiProperty() level!: number
  @ApiProperty({ nullable: true }) expireAt!: Date | null
  @ApiProperty() opAdminId!: string
  @ApiProperty() status!: number
  @ApiProperty() createdAt!: Date
}
