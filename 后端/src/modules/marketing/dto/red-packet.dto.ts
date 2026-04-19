/**
 * @file red-packet.dto.ts
 * @stage P4/T4.12（Sprint 2）
 * @desc 红包池 DTO：CRUD / 列表 / 视图 / 领取结果；金额一律 string + IsDecimal
 * @author 单 Agent V2.0（Agent C）
 *
 * 关键约束（与 P4 设计、07_marketing.sql 一致）：
 *   - packet_type：1 普通（等额平均） / 2 拼手气（二倍均值法） / 3 现金红包
 *   - status：0 草稿 / 1 进行中 / 2 已发完 / 3 已过期 / 4 已退款
 *   - target_user_ids = NULL → 任意用户；否则限定白名单
 *   - totalAmount / minAmount / maxAmount / receivedAmount：DECIMAL 字符串，0~2 位小数
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsDecimal,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf
} from 'class-validator'
import { PageQueryDto } from '@/common'

/**
 * 创建红包池入参（管理端）
 * 用途：POST /admin/red-packets
 *
 * 校验：
 *   - totalAmount > 0；totalQty 1~10000
 *   - 拼手气（packet_type=2）必须传 minAmount + maxAmount
 *   - validFrom < validTo
 */
export class CreateRedPacketDto {
  @ApiProperty({ description: '红包名称', example: '春节大派送' })
  @IsString()
  @Length(1, 128)
  name!: string

  @ApiProperty({
    description: '类型：1 普通 / 2 拼手气 / 3 现金红包',
    enum: [1, 2, 3],
    example: 2
  })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  packetType!: number

  @ApiPropertyOptional({ description: '发放方：1 平台 / 2 商户', enum: [1, 2], default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  issuerType?: number

  @ApiPropertyOptional({ description: '发放方 ID（issuerType=2 时为商户 ID）' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  issuerId?: string

  @ApiProperty({
    description: '总金额（DECIMAL 字符串，0~2 位小数，必须 > 0）',
    example: '100.00'
  })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'totalAmount 必须为最多 2 位小数的字符串' })
  totalAmount!: string

  @ApiProperty({ description: '总份数（1~10000）', example: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'totalQty 至少 1' })
  @Max(10000, { message: 'totalQty 至多 10000' })
  totalQty!: number

  @ApiPropertyOptional({ description: '单份最小金额（拼手气时建议传，默认 0.01）' })
  @ValidateIf((o: CreateRedPacketDto) => o.minAmount !== undefined && o.minAmount !== null)
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'minAmount 必须为最多 2 位小数的字符串' })
  minAmount?: string

  @ApiPropertyOptional({ description: '单份最大金额（拼手气时建议传，默认 totalAmount）' })
  @ValidateIf((o: CreateRedPacketDto) => o.maxAmount !== undefined && o.maxAmount !== null)
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'maxAmount 必须为最多 2 位小数的字符串' })
  maxAmount?: string

  @ApiPropertyOptional({
    description: '指定用户 ID 数组（NULL/空数组 = 任意用户），最多 1000 条',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000, { message: 'target_user_ids 最多 1000 条' })
  @IsString({ each: true })
  targetUserIds?: string[]

  @ApiProperty({ description: '生效起始（ISO 8601）', example: '2026-04-19T00:00:00.000Z' })
  @IsDateString({}, { message: 'validFrom 必须为 ISO 8601 日期字符串' })
  validFrom!: string

  @ApiProperty({ description: '失效时间（ISO 8601）', example: '2026-04-26T23:59:59.000Z' })
  @IsDateString({}, { message: 'validTo 必须为 ISO 8601 日期字符串' })
  validTo!: string

  @ApiPropertyOptional({ description: '红包祝福语（最多 255 字）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  wishing?: string

  @ApiPropertyOptional({ description: '红包封面图 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string
}

/**
 * 红包列表查询入参（管理端）
 * 用途：GET /admin/red-packets
 */
export class QueryRedPacketDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '类型筛选：1 普通 / 2 拼手气 / 3 现金红包' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  packetType?: number

  @ApiPropertyOptional({
    description: '状态筛选：0 草稿 / 1 进行中 / 2 已发完 / 3 已过期 / 4 已退款'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2, 3, 4])
  status?: number

  @ApiPropertyOptional({ description: '发放方类型：1 平台 / 2 商户' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  issuerType?: number

  @ApiPropertyOptional({ description: '发放方 ID' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  issuerId?: string

  @ApiPropertyOptional({ description: '红包名称模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  keyword?: string
}

/**
 * 红包视图（列表 / 详情）
 * 用途：GET /admin/red-packets, GET /admin/red-packets/:id, GET /red-packets/active
 */
export class RedPacketVo {
  @ApiProperty() id!: string
  @ApiProperty() packetCode!: string
  @ApiProperty() name!: string
  @ApiProperty({ description: '类型：1 普通 / 2 拼手气 / 3 现金红包' }) packetType!: number
  @ApiProperty({ description: '发放方：1 平台 / 2 商户' }) issuerType!: number
  @ApiProperty({ nullable: true }) issuerId!: string | null
  @ApiProperty({ description: '总金额' }) totalAmount!: string
  @ApiProperty({ description: '总份数' }) totalQty!: number
  @ApiProperty({ description: '已领取份数' }) receivedQty!: number
  @ApiProperty({ description: '已领取金额' }) receivedAmount!: string
  @ApiProperty({ description: '单份最小金额', nullable: true }) minAmount!: string | null
  @ApiProperty({ description: '单份最大金额', nullable: true }) maxAmount!: string | null
  @ApiProperty({
    description: '指定用户 ID 数组（NULL=任意）',
    type: [String],
    nullable: true
  })
  targetUserIds!: string[] | null
  @ApiProperty() validFrom!: Date
  @ApiProperty() validTo!: Date
  @ApiProperty({ nullable: true }) wishing!: string | null
  @ApiProperty({ nullable: true }) imageUrl!: string | null
  @ApiProperty({ description: '状态：0 草稿 / 1 进行中 / 2 已发完 / 3 已过期 / 4 已退款' })
  status!: number
  @ApiProperty() createdAt!: Date
  @ApiProperty() updatedAt!: Date
}

/**
 * 红包领取结果
 * 用途：POST /me/red-packets/:id/grab 返回值
 */
export class GrabRedPacketResultDto {
  @ApiProperty({ description: '红包 ID' })
  packetId!: string

  @ApiProperty({ description: '红包名称' })
  packetName!: string

  @ApiProperty({ description: '本次领取金额（小数 2 位字符串）', example: '5.66' })
  amount!: string

  @ApiProperty({ description: '本次领取份序（自 1 起；表示我是该红包的第几个领取人）' })
  grabSeq!: number

  @ApiProperty({ description: '领取时间戳（毫秒）' })
  grabbedAt!: number

  @ApiProperty({ description: '红包祝福语', nullable: true })
  wishing!: string | null
}

/**
 * 我的红包列表项视图
 * 用途：GET /me/red-packets 列表元素
 */
export class MyRedPacketItemVo {
  @ApiProperty() packetId!: string
  @ApiProperty() packetName!: string
  @ApiProperty({ description: '我领取的金额' }) amount!: string
  @ApiProperty({ description: '我领取的时间戳（毫秒）' }) grabbedAt!: number
  @ApiProperty({ description: '祝福语', nullable: true }) wishing!: string | null
}
