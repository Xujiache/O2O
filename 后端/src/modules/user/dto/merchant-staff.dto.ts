/**
 * @file merchant-staff.dto.ts
 * @desc 商户端子账号 CRUD DTO：列表查询 / 创建 / 更新 / 重置密码 / 视图
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator'
import { PageQueryDto } from '../../../common'

export const MERCHANT_STAFF_ROLE_VALUES = ['manager', 'cashier', 'staff'] as const
export type MerchantStaffRole = (typeof MERCHANT_STAFF_ROLE_VALUES)[number]

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

function trimEmptyToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * 商户端子账号分页查询入参
 * 用途：GET /merchant/staff
 *
 * 说明：shopId 仅做兼容性校验，不会形成真正的子账号-店铺过滤关系；
 *       当前 schema 下所有子账号默认覆盖当前商户的全部店铺。
 */
export class QueryMerchantStaffDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '店铺 ID（兼容前端筛选入参；当前仅校验归属）' })
  @IsOptional()
  @Transform(({ value }) => trimEmptyToUndefined(value))
  @IsString()
  @MaxLength(64)
  shopId?: string

  @ApiPropertyOptional({ description: '角色筛选', enum: MERCHANT_STAFF_ROLE_VALUES })
  @IsOptional()
  @IsIn([...MERCHANT_STAFF_ROLE_VALUES])
  role?: MerchantStaffRole

  @ApiPropertyOptional({ description: '状态：0 禁用 / 1 启用' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number
}

/**
 * 创建商户子账号入参
 * 用途：POST /merchant/staff
 *
 * 说明：shopIds 为前端兼容字段，后端仅校验必须属于当前商户且至少 1 个，
 *       不做持久化；实际返回值会展开为当前商户全部店铺。
 */
export class CreateMerchantStaffDto {
  @ApiProperty({ description: '登录用户名（商户内唯一）', example: 'cashier01' })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Length(1, 64)
  username!: string

  @ApiProperty({ description: '初始密码（至少 6 位）', example: 'Pwd@2026' })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string

  @ApiProperty({ description: '员工姓名', example: '王收银' })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Length(1, 64)
  realName!: string

  @ApiProperty({ description: '手机号（11 位）', example: '13800000000' })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不合法' })
  mobile!: string

  @ApiProperty({ description: '角色', enum: MERCHANT_STAFF_ROLE_VALUES, example: 'cashier' })
  @IsIn([...MERCHANT_STAFF_ROLE_VALUES])
  role!: MerchantStaffRole

  @ApiProperty({
    description: '关联店铺 ID 列表（兼容字段；仅校验，不持久化）',
    type: [String],
    example: ['180000000000000001']
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'shopIds 至少传 1 个店铺 ID' })
  @IsString({ each: true })
  shopIds!: string[]
}

/**
 * 更新商户子账号入参
 * 用途：PUT /merchant/staff/:id
 *
 * 兼容说明：前端编辑页会透传 password:''，这里将空串自动视为未传并忽略。
 */
export class UpdateMerchantStaffDto {
  @ApiPropertyOptional({ description: '登录用户名（商户内唯一）' })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Length(1, 64)
  username?: string

  @ApiPropertyOptional({ description: '新密码（可选；空串将被忽略）' })
  @IsOptional()
  @Transform(({ value }) => trimEmptyToUndefined(value))
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password?: string

  @ApiPropertyOptional({ description: '员工姓名' })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Length(1, 64)
  realName?: string

  @ApiPropertyOptional({ description: '手机号（11 位）' })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不合法' })
  mobile?: string

  @ApiPropertyOptional({ description: '角色', enum: MERCHANT_STAFF_ROLE_VALUES })
  @IsOptional()
  @IsIn([...MERCHANT_STAFF_ROLE_VALUES])
  role?: MerchantStaffRole

  @ApiPropertyOptional({
    description: '关联店铺 ID 列表（兼容字段；仅校验，不持久化）',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'shopIds 至少传 1 个店铺 ID' })
  @IsString({ each: true })
  shopIds?: string[]

  @ApiPropertyOptional({ description: '状态：0 禁用 / 1 启用' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number
}

/**
 * 重置子账号密码入参
 * 用途：POST /merchant/staff/:id/password/reset
 */
export class ResetMerchantStaffPasswordDto {
  @ApiProperty({ description: '新密码（至少 6 位）', example: 'NewPwd@2026' })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  newPassword!: string
}

/**
 * 子账号视图
 * 用途：商户端列表 / 详情 / 创建 / 更新 返回
 */
export class MerchantStaffVo {
  @ApiProperty({ description: '子账号 ID' }) id!: string
  @ApiProperty({ description: '登录用户名' }) username!: string
  @ApiProperty({ description: '员工姓名' }) realName!: string
  @ApiProperty({ description: '手机号（商户端返回明文）' }) mobile!: string
  @ApiProperty({ description: '角色', enum: MERCHANT_STAFF_ROLE_VALUES }) role!: MerchantStaffRole
  @ApiProperty({ description: '当前商户全部店铺 ID', type: [String] }) shopIds!: string[]
  @ApiProperty({ description: '当前商户全部店铺名称', type: [String] }) shopNames!: string[]
  @ApiProperty({ description: '状态：0 禁用 / 1 启用' }) status!: number
  @ApiPropertyOptional({ description: '最近登录时间', nullable: true }) lastLoginAt!: Date | null
  @ApiProperty({ description: '创建时间' }) createdAt!: Date
}
