/**
 * @file address.dto.ts
 * @stage P3 / T3.9
 * @desc 用户收货地址 DTO（CRUD + 默认切换）
 * @author 员工 B
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min
} from 'class-validator'

/**
 * 地址新增 DTO
 * 用途：POST /me/addresses
 */
export class CreateAddressDto {
  @ApiProperty({ description: '收件人姓名', example: '张三' })
  @IsString()
  @Length(1, 64)
  receiverName!: string

  @ApiProperty({ description: '收件人手机号（11 位）', example: '13800000000' })
  @IsString()
  @Matches(/^1[3-9][0-9]{9}$/, { message: '手机号格式不合法' })
  receiverMobile!: string

  @ApiProperty({ description: '省级行政区划代码（6 位）', example: '110000' })
  @IsString()
  @Length(6, 6)
  provinceCode!: string

  @ApiProperty({ description: '市级行政区划代码（6 位）', example: '110100' })
  @IsString()
  @Length(6, 6)
  cityCode!: string

  @ApiProperty({ description: '区/县行政区划代码（6 位）', example: '110101' })
  @IsString()
  @Length(6, 6)
  districtCode!: string

  @ApiProperty({ description: '省名称', example: '北京市' })
  @IsString()
  @MaxLength(32)
  provinceName!: string

  @ApiProperty({ description: '市名称', example: '北京市' })
  @IsString()
  @MaxLength(32)
  cityName!: string

  @ApiProperty({ description: '区/县名称', example: '东城区' })
  @IsString()
  @MaxLength(32)
  districtName!: string

  @ApiProperty({ description: '详细地址', example: '王府井大街 1 号 8 号楼 101' })
  @IsString()
  @MaxLength(255)
  detail!: string

  @ApiPropertyOptional({ description: '标签（家/公司/学校/其他）', example: '家' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  tag?: string

  @ApiPropertyOptional({ description: '经度（GCJ-02）', example: 116.40739 })
  @IsOptional()
  @IsLongitude()
  lng?: number

  @ApiPropertyOptional({ description: '纬度（GCJ-02）', example: 39.90419 })
  @IsOptional()
  @IsLatitude()
  lat?: number

  @ApiPropertyOptional({ description: '是否默认（0/1）', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @IsIn([0, 1])
  isDefault?: number
}

/**
 * 地址更新 DTO（全字段可选）
 * 用途：PUT /me/addresses/:id
 */
export class UpdateAddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 64) receiverName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9][0-9]{9}$/, { message: '手机号格式不合法' })
  receiverMobile?: string

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(6, 6) provinceCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(6, 6) cityCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(6, 6) districtCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) provinceName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) cityName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) districtName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) detail?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(16) tag?: string
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number
  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsIn([0, 1]) isDefault?: number
}

/**
 * 地址列表项视图（脱敏）
 * 用途：GET /me/addresses 列表
 */
export class AddressVo {
  @ApiProperty() id!: string
  @ApiProperty() receiverName!: string
  @ApiProperty({ description: '手机号末 4 位（脱敏）' }) receiverMobileTail4!: string
  @ApiProperty() provinceCode!: string
  @ApiProperty() cityCode!: string
  @ApiProperty() districtCode!: string
  @ApiProperty() provinceName!: string
  @ApiProperty() cityName!: string
  @ApiProperty() districtName!: string
  @ApiProperty() detail!: string
  @ApiProperty({ nullable: true }) tag!: string | null
  @ApiProperty({ nullable: true }) lng!: string | null
  @ApiProperty({ nullable: true }) lat!: string | null
  @ApiProperty() isDefault!: number
  @ApiProperty() createdAt!: Date
}
