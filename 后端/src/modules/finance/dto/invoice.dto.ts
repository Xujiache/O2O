/**
 * @file invoice.dto.ts
 * @stage P4/T4.34（Sprint 5）
 * @desc 发票 DTO：申请 / 审核 / 开票 / 列表 / 视图
 * @author 单 Agent V2.0
 *
 * 字段语义对齐 05_finance.sql invoice 表：
 *   - applicant_type 1 用户 / 2 商户
 *   - invoice_type   1 电子普票 / 2 电子专票 / 3 纸质普票 / 4 纸质专票
 *   - title_type     1 个人 / 2 企业
 *   - status         0 申请 / 1 开票中 / 2 已开 / 3 失败 / 4 已作废
 *   - mobile_enc / mobile_tail4 三件套（CryptoUtil）
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDecimal,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength
} from 'class-validator'
import { PageQueryDto } from '@/common'
import {
  InvoiceApplicantTypeEnum,
  type InvoiceApplicantType,
  InvoiceStatusEnum,
  type InvoiceStatus,
  InvoiceTitleTypeEnum,
  type InvoiceTitleType,
  InvoiceTypeEnum,
  type InvoiceType
} from '../types/finance.types'

/** 申请方枚举值数组 */
const APPLICANT_TYPE_VALUES = Object.values(InvoiceApplicantTypeEnum) as number[]
/** 发票类型枚举值数组 */
const INVOICE_TYPE_VALUES = Object.values(InvoiceTypeEnum) as number[]
/** 抬头类型枚举值数组 */
const TITLE_TYPE_VALUES = Object.values(InvoiceTitleTypeEnum) as number[]
/** 发票状态枚举值数组 */
const INVOICE_STATUS_VALUES = Object.values(InvoiceStatusEnum) as number[]

/* ============================================================================
 * 一、CreateInvoiceDto —— 申请发票
 * ============================================================================ */

/**
 * 发票申请入参（用户/商户 POST /me/invoices 或 /merchant/invoices）
 *
 * 注：applicantType / applicantId 由 controller 按端注入，不在 DTO 暴露
 *     orderNos 必填且非空；service.apply 会校验订单存在 + 总金额匹配
 *     mobile / email 至少传一个（service 校验）
 */
export class CreateInvoiceDto {
  @ApiProperty({
    description: '关联订单号数组（一票多单）',
    type: [String],
    example: ['T20260418000000001', 'T20260419000000002']
  })
  @IsArray()
  @ArrayMinSize(1, { message: '至少关联 1 笔订单' })
  @ArrayMaxSize(50, { message: '一次最多关联 50 笔订单' })
  @IsString({ each: true })
  @Length(18, 18, { each: true, message: '每个订单号必须为 18 位' })
  orderNos!: string[]

  @ApiProperty({
    description: '发票类型：1 电子普票 / 2 电子专票 / 3 纸质普票 / 4 纸质专票',
    enum: INVOICE_TYPE_VALUES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(INVOICE_TYPE_VALUES, { message: 'invoiceType 取值非法' })
  invoiceType!: InvoiceType

  @ApiProperty({
    description: '抬头类型：1 个人 / 2 企业',
    enum: TITLE_TYPE_VALUES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(TITLE_TYPE_VALUES, { message: 'titleType 取值非法' })
  titleType!: InvoiceTitleType

  @ApiProperty({ description: '抬头名称', example: '深圳测试科技有限公司' })
  @IsString()
  @Length(2, 255)
  title!: string

  @ApiPropertyOptional({ description: '税号（企业必填，15~20 位）', example: '91440300MA5XXXXXX' })
  @IsOptional()
  @IsString()
  @Length(15, 32)
  taxNo?: string

  @ApiPropertyOptional({ description: '注册地址（企业可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  registerAddr?: string

  @ApiPropertyOptional({ description: '注册电话（企业可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  registerPhone?: string

  @ApiPropertyOptional({ description: '开户行（企业可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  bankName?: string

  @ApiPropertyOptional({ description: '开户账号（企业可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  bankAccount?: string

  @ApiProperty({
    description: '开票金额（元，2 位小数字符串；service 校验 ≤ 订单总额）',
    example: '36.50'
  })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'amount 必须为最多 2 位小数的字符串' })
  amount!: string

  @ApiPropertyOptional({
    description: '电子发票收件邮箱（电子发票必填）',
    example: 'user@example.com'
  })
  @IsOptional()
  @IsEmail({}, { message: 'email 格式不正确' })
  @MaxLength(128)
  email?: string

  @ApiPropertyOptional({
    description: '收件手机（明文 11 位；service 内 CryptoUtil 三件套）',
    example: '13800001234'
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6,15}$/, { message: 'mobile 必须为 6~15 位数字' })
  mobile?: string
}

/* ============================================================================
 * 二、AuditInvoiceDto —— 管理端审核
 * ============================================================================ */

/**
 * 发票审核动作
 */
export const InvoiceAuditActions = ['pass', 'reject'] as const
/** AuditAction 字面量类型 */
export type InvoiceAuditAction = (typeof InvoiceAuditActions)[number]

/**
 * 发票审核入参（管理端 POST /admin/invoices/:id/audit）
 *
 * 状态流转：
 *   pass  → 0 申请 → 1 开票中
 *   reject → 0 申请 → 3 失败 + errorMsg
 */
export class AuditInvoiceDto {
  @ApiProperty({
    description: '审核动作：pass 通过（→ 开票中）/ reject 驳回（→ 失败）',
    enum: InvoiceAuditActions,
    example: 'pass'
  })
  @IsString()
  @IsIn(InvoiceAuditActions as unknown as string[], {
    message: 'action 必须为 pass 或 reject'
  })
  action!: InvoiceAuditAction

  @ApiPropertyOptional({ description: '驳回原因（reject 时建议必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/* ============================================================================
 * 三、IssueInvoiceDto —— 管理端开票（生成 PDF）
 * ============================================================================ */

/**
 * 开票入参（管理端 POST /admin/invoices/:id/issue）
 *
 * 状态流转：
 *   1 开票中 → 2 已开 + pdf_url + e_invoice_no + issued_at + 邮件通知
 *
 * 本期 mock 模式：内部生成假 PDF URL；不调用真实第三方
 */
export class IssueInvoiceDto {
  @ApiPropertyOptional({
    description: '电子发票号码（不传则系统生成）',
    example: '044001226212026XXXXXXXX'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  eInvoiceNo?: string

  @ApiPropertyOptional({
    description: '开票备注（仅留档，不影响 PDF）',
    example: '用户手动重发'
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/* ============================================================================
 * 四、QueryInvoiceDto —— 列表查询
 * ============================================================================ */

/**
 * 我的发票 / 管理端发票工作台 共用列表查询入参
 */
export class QueryInvoiceDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '状态', enum: INVOICE_STATUS_VALUES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(INVOICE_STATUS_VALUES)
  status?: InvoiceStatus

  @ApiPropertyOptional({
    description: '申请方类型（仅管理端工作台有效）',
    enum: APPLICANT_TYPE_VALUES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(APPLICANT_TYPE_VALUES)
  applicantType?: InvoiceApplicantType

  @ApiPropertyOptional({ description: '申请方 ID（管理端按申请方筛选）' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  applicantId?: string
}

/* ============================================================================
 * 五、InvoiceVo —— 发票视图
 * ============================================================================ */

/**
 * 发票视图对象
 *
 * 脱敏策略：
 *   - mobile 仅返回末 4 位
 *   - bankAccount 仅返回末 4 位（如有）
 *   - 其他字段透传
 */
export class InvoiceVo {
  @ApiProperty({ description: '主键' })
  id!: string

  @ApiProperty({ description: '内部发票编号' })
  invoiceNo!: string

  @ApiProperty({ description: '申请方类型', enum: APPLICANT_TYPE_VALUES })
  applicantType!: InvoiceApplicantType

  @ApiProperty({ description: '申请方 ID' })
  applicantId!: string

  @ApiProperty({ description: '关联订单号数组', type: [String] })
  orderNos!: string[]

  @ApiProperty({ description: '发票类型', enum: INVOICE_TYPE_VALUES })
  invoiceType!: InvoiceType

  @ApiProperty({ description: '抬头类型', enum: TITLE_TYPE_VALUES })
  titleType!: InvoiceTitleType

  @ApiProperty({ description: '抬头名称' })
  title!: string

  @ApiProperty({ description: '税号', nullable: true })
  taxNo!: string | null

  @ApiProperty({ description: '注册地址', nullable: true })
  registerAddr!: string | null

  @ApiProperty({ description: '注册电话', nullable: true })
  registerPhone!: string | null

  @ApiProperty({ description: '开户行', nullable: true })
  bankName!: string | null

  @ApiProperty({ description: '开户账号末 4 位（脱敏）', nullable: true })
  bankAccountTail4!: string | null

  @ApiProperty({ description: '开票金额（元）' })
  amount!: string

  @ApiProperty({ description: '收件邮箱', nullable: true })
  email!: string | null

  @ApiProperty({ description: '收件手机末 4 位（脱敏）', nullable: true })
  mobileTail4!: string | null

  @ApiProperty({ description: '状态', enum: INVOICE_STATUS_VALUES })
  status!: InvoiceStatus

  @ApiProperty({ description: '发票 PDF URL', nullable: true })
  pdfUrl!: string | null

  @ApiProperty({ description: '电子发票号码', nullable: true })
  eInvoiceNo!: string | null

  @ApiProperty({ description: '开票时间', nullable: true })
  issuedAt!: Date | null

  @ApiProperty({ description: '失败原因', nullable: true })
  errorMsg!: string | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}
