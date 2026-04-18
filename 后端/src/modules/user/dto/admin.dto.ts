/**
 * @file admin.dto.ts
 * @stage P3 / T3.12
 * @desc 管理员 DTO + 角色绑定 + 状态变更
 * @author 员工 B
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength
} from 'class-validator'
import { PageQueryDto } from '../../../common'

/**
 * 创建管理员 DTO
 * 用途：POST /api/v1/admin/admins
 */
export class CreateAdminDto {
  @ApiProperty({ description: '登录账号', example: 'op_zhangsan' })
  @IsString()
  @Length(3, 64)
  username!: string

  @ApiProperty({ description: '初始密码', example: 'Admin@123456' })
  @IsString()
  @Length(8, 64)
  password!: string

  @ApiPropertyOptional({ description: '昵称' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string

  @ApiPropertyOptional({ description: '手机号' })
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9][0-9]{9}$/)
  mobile?: string

  @ApiPropertyOptional({ description: '邮箱' })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional({
    description: '角色 ID 列表（绑定 admin_role）',
    isArray: true,
    type: String
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  roleIds?: string[]
}

/**
 * 更新管理员 DTO
 */
export class UpdateAdminDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) nickname?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) avatarUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^1[3-9][0-9]{9}$/) mobile?: string
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string

  @ApiPropertyOptional({ description: '重置密码' })
  @IsOptional()
  @IsString()
  @Length(8, 64)
  password?: string

  @ApiPropertyOptional({ description: '状态：0 禁用/1 正常' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number

  @ApiPropertyOptional({ description: '角色 ID 列表（覆盖式绑定）', isArray: true, type: String })
  @IsOptional()
  @IsArray()
  roleIds?: string[]
}

/**
 * 管理员列表查询入参
 */
export class AdminListAdminQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '账号模糊匹配' })
  @IsOptional()
  @IsString()
  username?: string

  @ApiPropertyOptional({ description: '昵称模糊匹配' })
  @IsOptional()
  @IsString()
  nickname?: string

  @ApiPropertyOptional({ description: '状态：0/1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number
}

/**
 * 管理员详情 VO
 */
export class AdminDetailVo {
  @ApiProperty() id!: string
  @ApiProperty() username!: string
  @ApiProperty({ nullable: true }) nickname!: string | null
  @ApiProperty({ nullable: true }) avatarUrl!: string | null
  @ApiProperty({ description: '手机号末 4 位', nullable: true }) mobileTail4!: string | null
  @ApiProperty({ nullable: true }) email!: string | null
  @ApiProperty() isSuper!: number
  @ApiProperty() status!: number
  @ApiProperty({ nullable: true }) lastLoginAt!: Date | null
  @ApiProperty({ description: '已绑定角色 ID 列表', isArray: true, type: String })
  roleIds!: string[]
  @ApiProperty() createdAt!: Date
}
