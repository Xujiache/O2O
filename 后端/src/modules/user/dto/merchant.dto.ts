/**
 * @file merchant.dto.ts
 * @stage P3 / T3.10
 * @desc 商户 DTO：入驻申请、资质提交、审核动作、列表查询、详情/列表 VO
 * @author 员工 B
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested
} from 'class-validator'
import { PageQueryDto } from '../../../common'

/**
 * 商户入驻申请 DTO
 * 用途：POST /api/v1/merchants （初次提交，写入 merchant 表 audit_status=0）
 */
export class CreateMerchantDto {
  @ApiProperty({ description: '商户名称', example: '老张烧烤' })
  @IsString()
  @Length(2, 128)
  name!: string

  @ApiPropertyOptional({ description: '商户简称' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  shortName?: string

  @ApiPropertyOptional({ description: 'LOGO URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  logoUrl?: string

  @ApiProperty({ description: '行业分类编码（sys_dict industry）', example: 'food.bbq' })
  @IsString()
  @MaxLength(32)
  industryCode!: string

  @ApiPropertyOptional({ description: '法定代表人姓名' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  legalPerson?: string

  @ApiPropertyOptional({ description: '法人身份证号' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{17}[0-9Xx]$/)
  legalIdCard?: string

  @ApiProperty({ description: '联系手机号（11 位）', example: '13800000000' })
  @IsString()
  @Matches(/^1[3-9][0-9]{9}$/)
  mobile!: string

  @ApiPropertyOptional({ description: '联系邮箱' })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiProperty({ description: '注册省编码（6 位）', example: '110000' })
  @IsString()
  @Length(6, 6)
  provinceCode!: string

  @ApiProperty({ description: '注册市编码（6 位）', example: '110100' })
  @IsString()
  @Length(6, 6)
  cityCode!: string

  @ApiProperty({ description: '注册区/县编码（6 位）', example: '110101' })
  @IsString()
  @Length(6, 6)
  districtCode!: string
}

/**
 * 商户更新 DTO（商户端 / 管理后台均可用）
 */
export class UpdateMerchantDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 128) name?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) shortName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) logoUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) industryCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) legalPerson?: string
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(6, 6) provinceCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(6, 6) cityCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(6, 6) districtCode?: string
}

/**
 * 资质附件 DTO
 * 用途：POST /api/v1/merchants/:id/qualifications
 */
export class SubmitQualificationDto {
  @ApiProperty({
    description: '资质类型：1 营业执照/2 食品经营许可证/3 法人身份证/4 其他',
    example: 1
  })
  @IsInt()
  @IsIn([1, 2, 3, 4])
  qualType!: number

  @ApiPropertyOptional({ description: '证件编号' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  certNo?: string

  @ApiPropertyOptional({ description: '证件名称（实体名称）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  certName?: string

  @ApiPropertyOptional({ description: '生效起始日 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  validFrom?: string

  @ApiPropertyOptional({ description: '到期日 YYYY-MM-DD（NULL=长期）' })
  @IsOptional()
  @IsDateString()
  validTo?: string

  @ApiProperty({
    description: '附件 URL（多张逗号分隔）',
    example: 'https://oss/a.jpg,https://oss/b.jpg'
  })
  @IsString()
  @MaxLength(1024)
  attachUrl!: string
}

/**
 * 批量资质提交 DTO（一次性提交多类资质）
 */
export class SubmitQualificationBatchDto {
  @ApiProperty({ type: SubmitQualificationDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitQualificationDto)
  list!: SubmitQualificationDto[]
}

/**
 * 商户审核动作 DTO（管理后台）
 * 用途：POST /api/v1/admin/merchants/:id/audit
 */
export class AuditMerchantDto {
  @ApiProperty({ description: '动作：1 通过/2 驳回/3 待补件', example: 1 })
  @IsInt()
  @IsIn([1, 2, 3])
  action!: number

  @ApiPropertyOptional({ description: '备注（驳回必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/**
 * 商户列表查询入参
 * 用途：GET /api/v1/admin/merchants
 */
export class AdminListMerchantQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '商户名称模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string

  @ApiPropertyOptional({ description: '联系手机号（精确）' })
  @IsOptional()
  @IsString()
  mobile?: string

  @ApiPropertyOptional({ description: '行业分类编码' })
  @IsOptional()
  @IsString()
  industryCode?: string

  @ApiPropertyOptional({ description: '城市编码' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  cityCode?: string

  @ApiPropertyOptional({ description: '审核状态：0 待审/1 通过/2 驳回/3 待补件' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2, 3])
  auditStatus?: number

  @ApiPropertyOptional({ description: '账号状态：0 封禁/1 正常/2 暂停' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  status?: number
}

/**
 * 商户详情视图（脱敏）
 */
export class MerchantDetailVo {
  @ApiProperty() id!: string
  @ApiProperty() merchantNo!: string
  @ApiProperty() name!: string
  @ApiProperty({ nullable: true }) shortName!: string | null
  @ApiProperty({ nullable: true }) logoUrl!: string | null
  @ApiProperty() industryCode!: string
  @ApiProperty({ nullable: true }) legalPerson!: string | null
  @ApiProperty({ description: '法人身份证号末 4 位（脱敏）', nullable: true })
  legalIdCardTail4!: string | null
  @ApiProperty({ description: '联系手机号末 4 位' }) mobileTail4!: string
  @ApiProperty({ nullable: true }) email!: string | null
  @ApiProperty() provinceCode!: string
  @ApiProperty() cityCode!: string
  @ApiProperty() districtCode!: string
  @ApiProperty() auditStatus!: number
  @ApiProperty({ nullable: true }) auditRemark!: string | null
  @ApiProperty({ nullable: true }) auditAt!: Date | null
  @ApiProperty() status!: number
  @ApiProperty() createdAt!: Date
}

/**
 * 资质详情视图
 */
export class QualificationVo {
  @ApiProperty() id!: string
  @ApiProperty() merchantId!: string
  @ApiProperty() qualType!: number
  @ApiProperty({ nullable: true }) certNo!: string | null
  @ApiProperty({ nullable: true }) certName!: string | null
  @ApiProperty({ nullable: true }) validFrom!: Date | null
  @ApiProperty({ nullable: true }) validTo!: Date | null
  @ApiProperty() attachUrl!: string
  @ApiProperty() auditStatus!: number
  @ApiProperty({ nullable: true }) auditRemark!: string | null
  @ApiProperty() createdAt!: Date
}
