/**
 * @file user.dto.ts
 * @stage P3 / T3.9
 * @desc 用户中心 C 端 DTO：个人信息查询/更新、实名认证、列表查询入参、详情/列表响应（脱敏）
 * @author 员工 B
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsDateString,
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
 * 个人信息更新 DTO（用户端 PUT /me）
 * 用途：用户编辑自己的昵称/头像/性别/生日
 */
export class UpdateMyProfileDto {
  @ApiPropertyOptional({ description: '昵称', example: '张三' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string

  @ApiPropertyOptional({ description: '头像 URL', example: 'https://cdn/x.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string

  @ApiPropertyOptional({ description: '性别：0 未知/1 男/2 女', example: 1 })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2])
  gender?: number

  @ApiPropertyOptional({ description: '生日（YYYY-MM-DD）', example: '1995-08-15' })
  @IsOptional()
  @IsDateString()
  birthday?: string
}

/**
 * 实名认证提交 DTO
 * 用途：POST /me/realname；调用三方核验后写入 *_enc / *_hash 列
 */
export class SubmitRealnameDto {
  @ApiProperty({ description: '真实姓名', example: '张三' })
  @IsString()
  @Length(2, 32)
  realName!: string

  @ApiProperty({ description: '身份证号（18 位）', example: '110101199003078888' })
  @IsString()
  @Matches(/^[0-9]{17}[0-9Xx]$/, { message: '身份证号格式不合法' })
  idCard!: string
}

/**
 * 管理后台用户列表查询入参
 * 用途：GET /admin/users
 */
export class AdminListUserQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '手机号（精确匹配，内部转 hash）', example: '13800000000' })
  @IsOptional()
  @IsString()
  mobile?: string

  @ApiPropertyOptional({ description: '昵称模糊匹配', example: '张' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string

  @ApiPropertyOptional({ description: '账号状态：0 封禁/1 正常/2 注销中', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  status?: number

  @ApiPropertyOptional({ description: '是否实名：0/1', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isRealname?: number
}

/**
 * 用户详情视图（脱敏）
 * 用途：GET /me / GET /admin/users/:id 详情；不返回 *_enc / *_hash
 */
export class UserDetailVo {
  @ApiProperty({ description: '雪花 ID 字符串' }) id!: string
  @ApiProperty({ description: '昵称', nullable: true }) nickname!: string | null
  @ApiProperty({ description: '头像 URL', nullable: true }) avatarUrl!: string | null
  @ApiProperty({ description: '性别' }) gender!: number
  @ApiProperty({ description: '生日', nullable: true }) birthday!: string | null
  @ApiProperty({ description: '手机号末 4 位（脱敏）', nullable: true }) mobileTail4!: string | null
  @ApiProperty({ description: '是否实名' }) isRealname!: number
  @ApiProperty({ description: '账号状态' }) status!: number
  @ApiProperty({ description: '注册来源' }) regSource!: number
  @ApiProperty({ description: '最近登录时间', nullable: true }) lastLoginAt!: Date | null
  @ApiProperty({ description: '注册时间' }) createdAt!: Date
}
