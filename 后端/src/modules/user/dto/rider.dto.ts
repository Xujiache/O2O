/**
 * @file rider.dto.ts
 * @stage P3 / T3.11
 * @desc 骑手 DTO：入驻、资质、保证金、列表/详情
 * @author 员工 B
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min
} from 'class-validator'
import { PageQueryDto } from '../../../common'

/**
 * 骑手注册申请 DTO
 * 用途：POST /api/v1/riders（公开；账号在 A 的 Auth 模块审核通过后开通）
 */
export class CreateRiderDto {
  @ApiProperty({ description: '真实姓名', example: '李四' })
  @IsString()
  @Length(2, 32)
  realName!: string

  @ApiProperty({ description: '手机号', example: '13800000000' })
  @IsString()
  @Matches(/^1[3-9][0-9]{9}$/)
  mobile!: string

  @ApiProperty({ description: '身份证号', example: '110101199001011234' })
  @IsString()
  @Matches(/^[0-9]{17}[0-9Xx]$/)
  idCard!: string

  @ApiPropertyOptional({ description: '性别：0/1/2', example: 1 })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2])
  gender?: number

  @ApiPropertyOptional({ description: '生日 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  birthday?: string

  @ApiProperty({ description: '服务城市编码（6 位）', example: '110100' })
  @IsString()
  @Length(6, 6)
  serviceCity!: string

  @ApiPropertyOptional({ description: '配送工具：1 电动车/2 摩托车/3 自行车/4 步行' })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3, 4])
  vehicleType?: number

  @ApiPropertyOptional({ description: '电动车车牌号' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehicleNo?: string
}

/**
 * 骑手资料更新 DTO
 */
export class UpdateRiderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) avatarUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsIn([0, 1, 2]) gender?: number
  @ApiPropertyOptional() @IsOptional() @IsDateString() birthday?: string
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsIn([1, 2, 3, 4]) vehicleType?: number
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) vehicleNo?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(6, 6) serviceCity?: string

  @ApiPropertyOptional({ description: '银行卡号（绑定提现卡）' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{12,30}$/)
  bankCard?: string

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) bankName?: string
}

/**
 * 骑手保证金操作 DTO
 * 用途：POST /api/v1/riders/:id/deposit
 */
export class RiderDepositOpDto {
  @ApiProperty({ description: '操作类型：1 缴纳/2 补缴/3 扣除/4 退还', example: 1 })
  @IsInt()
  @IsIn([1, 2, 3, 4])
  opType!: number

  @ApiProperty({ description: '金额（正数）', example: 500 })
  @IsNumber()
  @IsPositive()
  amount!: number

  @ApiPropertyOptional({ description: '关联支付/退款单号' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  payNo?: string

  @ApiPropertyOptional({ description: '说明（违规扣除原因等）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string
}

/**
 * 骑手审核动作 DTO
 */
export class AuditRiderDto {
  @ApiProperty({ description: '动作：1 通过/2 驳回/3 待补件' })
  @IsInt()
  @IsIn([1, 2, 3])
  action!: number

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/**
 * 管理后台骑手列表查询入参
 */
export class AdminListRiderQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '手机号（精确）' })
  @IsOptional()
  @IsString()
  mobile?: string

  @ApiPropertyOptional({ description: '服务城市编码' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  serviceCity?: string

  @ApiPropertyOptional({ description: '审核状态：0/1/2/3' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2, 3])
  auditStatus?: number

  @ApiPropertyOptional({ description: '账号状态：0/1/2' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  status?: number

  @ApiPropertyOptional({ description: '在线状态：0 离线/1 在线/2 忙碌' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  onlineStatus?: number

  @ApiPropertyOptional({ description: '骑手等级 1~5' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  level?: number
}

/**
 * 骑手详情视图（脱敏）
 */
export class RiderDetailVo {
  @ApiProperty() id!: string
  @ApiProperty() riderNo!: string
  @ApiProperty({ description: '姓氏脱敏（如 张*）', nullable: true }) nameTail!: string | null
  @ApiProperty({ description: '手机号末 4 位' }) mobileTail4!: string
  @ApiProperty() gender!: number
  @ApiProperty({ nullable: true }) birthday!: Date | null
  @ApiProperty({ description: '银行卡末 4 位', nullable: true }) bankCardTail4!: string | null
  @ApiProperty({ nullable: true }) bankName!: string | null
  @ApiProperty({ nullable: true }) avatarUrl!: string | null
  @ApiProperty({ nullable: true }) vehicleType!: number | null
  @ApiProperty({ nullable: true }) vehicleNo!: string | null
  @ApiProperty() serviceCity!: string
  @ApiProperty() level!: number
  @ApiProperty() score!: string
  @ApiProperty() auditStatus!: number
  @ApiProperty({ nullable: true }) auditRemark!: string | null
  @ApiProperty() status!: number
  @ApiProperty() onlineStatus!: number
  @ApiProperty({ nullable: true }) lastOnlineAt!: Date | null
  @ApiProperty() createdAt!: Date
}

/**
 * 保证金记录视图
 */
export class RiderDepositVo {
  @ApiProperty() id!: string
  @ApiProperty() riderId!: string
  @ApiProperty() opType!: number
  @ApiProperty() amount!: string
  @ApiProperty() balanceAfter!: string
  @ApiProperty({ nullable: true }) payNo!: string | null
  @ApiProperty({ nullable: true }) reason!: string | null
  @ApiProperty({ nullable: true }) opAdminId!: string | null
  @ApiProperty() createdAt!: Date
}
