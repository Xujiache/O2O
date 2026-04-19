/**
 * @file shop.dto.ts
 * @stage P4/T4.1（Sprint 1）
 * @desc 店铺 DTO：创建/更新/查询/视图 + 公告/自动接单/营业状态/审核/封禁
 * @author 单 Agent V2.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min
} from 'class-validator'
import { PageQueryDto } from '@/common'

/**
 * 营业状态枚举（与 shop.business_status 列对齐）
 * 0 打烊 / 1 营业中 / 2 临时歇业
 */
export const BUSINESS_STATUS = [0, 1, 2] as const

/**
 * 审核动作枚举
 * pass=审核通过（audit_status→1）；reject=驳回（audit_status→2）
 */
export const AUDIT_ACTIONS = ['pass', 'reject'] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/**
 * 创建店铺入参（商户端）
 * 用途：POST /api/v1/merchant/shop
 *
 * 注：merchantId 来自当前登录态（CurrentUser.uid），不在入参里出现，避免越权创建他人名下店铺。
 *     金额字段（minOrderAmount/baseDeliveryFee/packagingFee）统一用 string，避免 JS Number 精度问题。
 */
export class CreateShopDto {
  @ApiProperty({ description: '店铺名称', example: '老张烧烤' })
  @IsString()
  @Length(2, 128)
  name!: string

  @ApiPropertyOptional({ description: '店铺简称' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  shortName?: string

  @ApiPropertyOptional({ description: '店铺 LOGO URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  logoUrl?: string

  @ApiPropertyOptional({ description: '店铺封面图 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  coverUrl?: string

  @ApiProperty({ description: '行业分类编码（→ sys_dict industry）', example: 'food.bbq' })
  @IsString()
  @MaxLength(32)
  industryCode!: string

  @ApiProperty({ description: '省级行政区划编码（6 位）', example: '110000' })
  @IsString()
  @Length(6, 6)
  provinceCode!: string

  @ApiProperty({ description: '市级行政区划编码（6 位）', example: '110100' })
  @IsString()
  @Length(6, 6)
  cityCode!: string

  @ApiProperty({ description: '区/县行政区划编码（6 位）', example: '110105' })
  @IsString()
  @Length(6, 6)
  districtCode!: string

  @ApiProperty({ description: '门店详细地址', example: '朝阳区望京街 9 号' })
  @IsString()
  @Length(2, 255)
  address!: string

  @ApiProperty({ description: '门店经度（GCJ-02）', example: 116.4806 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number

  @ApiProperty({ description: '门店纬度（GCJ-02）', example: 39.9938 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number

  @ApiProperty({ description: '联系手机号（11 位）', example: '13800000000' })
  @IsString()
  @Matches(/^1[3-9][0-9]{9}$/, { message: '联系手机号格式非法' })
  contactMobile!: string

  @ApiPropertyOptional({ description: '营业时间摘要（例：每天 09:00-22:00）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  businessHoursSummary?: string

  @ApiPropertyOptional({ description: '起送价（元，字符串）', example: '20.00' })
  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'minOrderAmount 必须为合法数值字符串' })
  minOrderAmount?: string

  @ApiPropertyOptional({ description: '基础配送费（元，字符串）', example: '5.00' })
  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'baseDeliveryFee 必须为合法数值字符串' })
  baseDeliveryFee?: string

  @ApiPropertyOptional({ description: '默认打包费（元，字符串）', example: '1.00' })
  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'packagingFee 必须为合法数值字符串' })
  packagingFee?: string

  @ApiPropertyOptional({ description: '最大配送距离（米）', example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  deliveryDistanceMax?: number

  @ApiPropertyOptional({ description: '平均出餐时长（分钟）', example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  avgPrepareMin?: number
}

/**
 * 更新店铺入参（商户端）
 * 用途：PUT /api/v1/merchant/shop/:id
 *
 * 全部字段可选（局部更新）；命中敏感字段（name/address/lng/lat/contactMobile/industryCode）→ audit_status 重置 0。
 */
export class UpdateShopDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 128) name?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) shortName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) logoUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) coverUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) industryCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(6, 6) provinceCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(6, 6) cityCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(6, 6) districtCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 255) address?: string

  @ApiPropertyOptional({ description: '门店经度（GCJ-02）' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number

  @ApiPropertyOptional({ description: '门店纬度（GCJ-02）' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number

  @ApiPropertyOptional({ description: '联系手机号（11 位）' })
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9][0-9]{9}$/, { message: '联系手机号格式非法' })
  contactMobile?: string

  @ApiPropertyOptional({ description: '营业时间摘要' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  businessHoursSummary?: string

  @ApiPropertyOptional({ description: '起送价（元，字符串）' })
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  minOrderAmount?: string

  @ApiPropertyOptional({ description: '基础配送费（元，字符串）' })
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  baseDeliveryFee?: string

  @ApiPropertyOptional({ description: '默认打包费（元，字符串）' })
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  packagingFee?: string

  @ApiPropertyOptional({ description: '最大配送距离（米）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  deliveryDistanceMax?: number

  @ApiPropertyOptional({ description: '平均出餐时长（分钟）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  avgPrepareMin?: number
}

/**
 * 商户端店铺列表查询入参
 * 用途：GET /api/v1/merchant/shop
 */
export class QueryShopDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '店铺名称模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string

  @ApiPropertyOptional({ description: '审核状态：0 待审 / 1 通过 / 2 驳回' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  auditStatus?: number

  @ApiPropertyOptional({ description: '账号状态：0 封禁 / 1 正常' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number
}

/**
 * 切换自动接单开关入参
 * 用途：PUT /api/v1/merchant/shop/:id/auto-accept
 */
export class SetAutoAcceptDto {
  @ApiProperty({ description: '是否自动接单：0 关 / 1 开', example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  autoAccept!: number
}

/**
 * 设置店铺公告入参
 * 用途：PUT /api/v1/merchant/shop/:id/announcement
 */
export class SetAnnouncementDto {
  @ApiProperty({ description: '公告内容（≤ 500 字）', example: '今日特惠：所有套餐 8 折' })
  @IsString()
  @MaxLength(500)
  announcement!: string
}

/**
 * 切换营业状态入参
 * 用途：PUT /api/v1/merchant/shop/:id/business-status
 */
export class SetBusinessStatusDto {
  @ApiProperty({
    description: '营业状态：0 打烊 / 1 营业中 / 2 临时歇业',
    enum: BUSINESS_STATUS,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(BUSINESS_STATUS as unknown as number[])
  businessStatus!: number
}

/**
 * 管理端店铺列表查询入参
 * 用途：GET /api/v1/admin/shops
 */
export class AdminListShopQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '店铺名称模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string

  @ApiPropertyOptional({ description: '城市编码（6 位）' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  cityCode?: string

  @ApiPropertyOptional({ description: '行业分类编码' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  industryCode?: string

  @ApiPropertyOptional({ description: '审核状态：0 待审 / 1 通过 / 2 驳回' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  auditStatus?: number

  @ApiPropertyOptional({ description: '营业状态：0 打烊 / 1 营业中 / 2 临时歇业' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(BUSINESS_STATUS as unknown as number[])
  businessStatus?: number

  @ApiPropertyOptional({ description: '账号状态：0 封禁 / 1 正常' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number
}

/**
 * 管理端审核入参
 * 用途：POST /api/v1/admin/shops/:id/audit
 */
export class AuditShopDto {
  @ApiProperty({ description: '审核动作', enum: AUDIT_ACTIONS, example: 'pass' })
  @IsIn(AUDIT_ACTIONS as unknown as string[])
  action!: AuditAction

  @ApiPropertyOptional({ description: '审核备注（reject 时建议必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/**
 * 管理端封禁入参
 * 用途：POST /api/v1/admin/shops/:id/ban
 */
export class BanShopDto {
  @ApiProperty({ description: '封禁原因（必填）', example: '违规售卖禁售商品' })
  @IsString()
  @Length(2, 255)
  reason!: string
}

/**
 * 联系电话脱敏视图
 * 字段：tail4 末 4 位；mask 仅在 owner/admin 视角下返回完整中段脱敏
 */
export class ContactMobileVo {
  @ApiProperty({ description: '联系手机末 4 位', example: '0000' })
  tail4!: string

  @ApiPropertyOptional({
    description: '完整中段脱敏（仅 owner/admin 可见）',
    example: '138****0000'
  })
  mask?: string
}

/**
 * 店铺视图（商户/管理端通用）
 *
 * 注：禁返回 contact_mobile_enc / contact_mobile_hash 列；contactMobile 仅返回脱敏对象
 */
export class ShopVo {
  @ApiProperty({ description: '店铺主键' }) id!: string
  @ApiProperty({ description: '所属商户 ID' }) merchantId!: string
  @ApiProperty({ description: '店铺名称' }) name!: string
  @ApiProperty({ description: '店铺简称', nullable: true }) shortName!: string | null
  @ApiProperty({ description: '店铺 LOGO', nullable: true }) logoUrl!: string | null
  @ApiProperty({ description: '店铺封面图', nullable: true }) coverUrl!: string | null
  @ApiProperty({ description: '行业分类编码' }) industryCode!: string
  @ApiProperty({ description: '省编码（6 位）' }) provinceCode!: string
  @ApiProperty({ description: '市编码（6 位）' }) cityCode!: string
  @ApiProperty({ description: '区/县编码（6 位）' }) districtCode!: string
  @ApiProperty({ description: '门店详细地址' }) address!: string
  @ApiProperty({ description: '门店经度（GCJ-02）' }) lng!: number
  @ApiProperty({ description: '门店纬度（GCJ-02）' }) lat!: number
  @ApiProperty({ description: '联系电话脱敏', type: ContactMobileVo })
  contactMobile!: ContactMobileVo
  @ApiProperty({ description: '营业时间摘要', nullable: true })
  businessHoursSummary!: string | null
  @ApiProperty({ description: '起送价（元，字符串）' }) minOrderAmount!: string
  @ApiProperty({ description: '基础配送费（元，字符串）' }) baseDeliveryFee!: string
  @ApiProperty({ description: '默认打包费（元，字符串）' }) packagingFee!: string
  @ApiProperty({ description: '最大配送距离（米）' }) deliveryDistanceMax!: number
  @ApiProperty({ description: '平均出餐时长（分钟）' }) avgPrepareMin!: number
  @ApiProperty({ description: '综合评分（0~5.00，字符串）', example: '5.00' }) score!: string
  @ApiProperty({ description: '评分人数' }) scoreCount!: number
  @ApiProperty({ description: '月销量' }) monthlySales!: number
  @ApiProperty({ description: '自动接单：0 关 / 1 开' }) autoAccept!: number
  @ApiProperty({ description: '店铺公告', nullable: true }) announcement!: string | null
  @ApiProperty({ description: '营业状态：0 打烊 / 1 营业中 / 2 临时歇业' }) businessStatus!: number
  @ApiProperty({ description: '审核状态：0 待审 / 1 通过 / 2 驳回' }) auditStatus!: number
  @ApiProperty({ description: '审核备注', nullable: true }) auditRemark!: string | null
  @ApiProperty({ description: '账号状态：0 封禁 / 1 正常' }) status!: number
  @ApiProperty({ description: '创建时间' }) createdAt!: Date
  @ApiProperty({ description: '更新时间' }) updatedAt!: Date
}
