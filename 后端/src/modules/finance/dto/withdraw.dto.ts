/**
 * @file withdraw.dto.ts
 * @stage P4/T4.33（Sprint 5）
 * @desc 提现 DTO：申请 / 审核 / 列表 / 视图
 * @author 单 Agent V2.0
 *
 * 银行卡敏感字段：
 *   - 入参 bankCardNo / accountHolder：明文 string（class-validator 校验）
 *   - service 内 CryptoUtil.encrypt → bank_card_no_enc / account_holder_enc
 *   - 末 4 位 → bank_card_tail4
 *   - 出参 VO 仅 tail4 + 脱敏持卡人（mask）
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsDecimal,
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
  WithdrawOwnerTypeEnum,
  type WithdrawOwnerType,
  WithdrawStatusEnum,
  type WithdrawStatus
} from '../types/finance.types'

/** 提现主体枚举值数组 */
const WITHDRAW_OWNER_TYPE_VALUES = Object.values(WithdrawOwnerTypeEnum) as number[]
/** 提现状态枚举值数组 */
const WITHDRAW_STATUS_VALUES = Object.values(WithdrawStatusEnum) as number[]

/* ============================================================================
 * 一、CreateWithdrawDto —— 提现申请入参
 * ============================================================================ */

/**
 * 提现申请入参（商户/骑手 POST /merchant/withdrawals + /rider/withdrawals）
 *
 * 注：ownerType / ownerId 由 controller 按端注入，不在 DTO 暴露，避免越权
 *     金额上限不在 DTO 校验，由 service.apply 比较 account.balance
 */
export class CreateWithdrawDto {
  @ApiProperty({ description: '提现金额（元，2 位小数字符串）', example: '100.00' })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'amount 必须为最多 2 位小数的字符串' })
  amount!: string

  @ApiProperty({
    description: '银行卡号（明文，仅数字 6-30 位）',
    example: '6225881234567890'
  })
  @IsString()
  @Matches(/^[0-9]{6,30}$/, { message: 'bankCardNo 必须为 6~30 位数字' })
  bankCardNo!: string

  @ApiProperty({ description: '持卡人姓名（明文）', example: '张三' })
  @IsString()
  @Length(2, 32, { message: 'accountHolder 长度必须 2~32' })
  accountHolder!: string

  @ApiProperty({ description: '开户行名称', example: '招商银行' })
  @IsString()
  @Length(2, 64)
  bankName!: string

  @ApiPropertyOptional({ description: '支行名称', example: '深圳科技园支行' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  bankBranch?: string
}

/* ============================================================================
 * 二、AuditWithdrawDto —— 审核入参
 * ============================================================================ */

/**
 * 审核动作枚举
 */
export const WithdrawAuditActions = ['pass', 'reject'] as const
/** AuditAction 字面量类型（'pass' | 'reject'） */
export type WithdrawAuditAction = (typeof WithdrawAuditActions)[number]

/**
 * 提现审核入参（管理端 POST /admin/withdrawals/:id/audit）
 *
 * 状态流转（与 finance.types.ts WithdrawStatusEnum 对应）：
 *   pass  → 0/1 → 3 打款中（合并 1 审核中→3 打款中）
 *   reject → 0/1 → 2 驳回 + 解冻
 */
export class AuditWithdrawDto {
  @ApiProperty({
    description: '审核动作：pass 通过（→ 打款中）/ reject 驳回（→ 解冻退款）',
    enum: WithdrawAuditActions,
    example: 'pass'
  })
  @IsString()
  @IsIn(WithdrawAuditActions as unknown as string[], {
    message: 'action 必须为 pass 或 reject'
  })
  action!: WithdrawAuditAction

  @ApiPropertyOptional({ description: '审核备注（驳回时建议必填）', example: '银行卡信息有误' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string
}

/* ============================================================================
 * 三、QueryWithdrawDto —— 列表查询
 * ============================================================================ */

/**
 * 我的提现 / 管理端工作台 共用列表查询入参
 */
export class QueryWithdrawDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: '状态筛选',
    enum: WITHDRAW_STATUS_VALUES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(WITHDRAW_STATUS_VALUES)
  status?: WithdrawStatus

  @ApiPropertyOptional({
    description: '主体类型筛选（仅管理端工作台有效）',
    enum: WITHDRAW_OWNER_TYPE_VALUES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(WITHDRAW_OWNER_TYPE_VALUES)
  ownerType?: WithdrawOwnerType

  @ApiPropertyOptional({ description: '主体 ID（管理端按主体筛选；非管理端忽略）' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ownerId?: string
}

/* ============================================================================
 * 四、WithdrawVo —— 提现视图（脱敏）
 * ============================================================================ */

/**
 * 提现视图对象
 *
 * 脱敏策略：
 *   - 仅返回 bankCardTail4（4 位）
 *   - 持卡人姓名做 mask（保留首末位，例：张*三 / 陈**清）
 *   - 不返回明文卡号
 */
export class WithdrawVo {
  @ApiProperty({ description: '主键' })
  id!: string

  @ApiProperty({ description: '提现单号', example: 'WD20260420000001' })
  withdrawNo!: string

  @ApiProperty({
    description: '主体类型：2 商户 / 3 骑手',
    enum: WITHDRAW_OWNER_TYPE_VALUES
  })
  ownerType!: WithdrawOwnerType

  @ApiProperty({ description: '主体 ID' })
  ownerId!: string

  @ApiProperty({ description: '账户 ID' })
  accountId!: string

  @ApiProperty({ description: '申请金额（元）', example: '100.00' })
  amount!: string

  @ApiProperty({ description: '提现手续费（元）', example: '0.00' })
  fee!: string

  @ApiProperty({ description: '实际到账金额（元）', example: '100.00' })
  actualAmount!: string

  @ApiProperty({ description: '银行卡末 4 位', example: '7890' })
  bankCardTail4!: string

  @ApiProperty({ description: '持卡人姓名（脱敏）', example: '张*' })
  accountHolderMask!: string

  @ApiProperty({ description: '开户行名称' })
  bankName!: string

  @ApiProperty({ description: '支行名称', nullable: true })
  bankBranch!: string | null

  @ApiProperty({
    description: '状态',
    enum: WITHDRAW_STATUS_VALUES,
    example: 0
  })
  status!: WithdrawStatus

  @ApiProperty({ description: '审核管理员 ID', nullable: true })
  auditAdminId!: string | null

  @ApiProperty({ description: '审核时间', nullable: true })
  auditAt!: Date | null

  @ApiProperty({ description: '审核备注', nullable: true })
  auditRemark!: string | null

  @ApiProperty({ description: '第三方付款单号', nullable: true })
  payoutNo!: string | null

  @ApiProperty({ description: '打款完成时间', nullable: true })
  payoutAt!: Date | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}
