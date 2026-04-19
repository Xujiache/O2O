/**
 * @file settlement.dto.ts
 * @stage P4/T4.31 + T4.32（Sprint 5）
 * @desc 分账规则 / 分账记录 DTO
 * @author 单 Agent V2.0
 *
 * 字段语义对齐 05_finance.sql：
 *   - settlement_rule.scene/target_type/scope_type/rate/fixed_fee/min_fee/max_fee/priority
 *   - settlement_record.target_type/target_id/base_amount/rate/fixed_fee/settle_amount/status
 *   - 金额字段一律 string；service 用 BigNumber
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsDateString,
  IsDecimal,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min
} from 'class-validator'
import { PageQueryDto } from '@/common'
import {
  SettlementRecordStatusEnum,
  type SettleStatus,
  SettlementSceneEnum,
  type SettlementRuleScene,
  SettlementScopeTypeEnum,
  type SettlementScopeType,
  SettlementTargetTypeEnum,
  type SettlementTargetType
} from '../types/finance.types'

/** 场景枚举值数组 */
const SCENE_VALUES = Object.values(SettlementSceneEnum) as number[]
/** 目标类型枚举值数组 */
const TARGET_TYPE_VALUES = Object.values(SettlementTargetTypeEnum) as number[]
/** 范围类型枚举值数组 */
const SCOPE_TYPE_VALUES = Object.values(SettlementScopeTypeEnum) as number[]
/** 规则状态枚举值（settlement_rule.status：0 停用 / 1 启用） */
const RULE_STATUS_VALUES = [0, 1] as const
/** 分账记录状态枚举值数组 */
const RECORD_STATUS_VALUES = Object.values(SettlementRecordStatusEnum) as number[]

/* ============================================================================
 * 一、CreateSettlementRuleDto —— 创建规则入参（管理端）
 * ============================================================================ */

/**
 * 创建分账规则入参（管理端 POST /admin/settlement-rules）
 *
 * 字段语义：
 *   - rate    比例 0~1（如 0.85 = 85%）
 *   - fixedFee 固定费（元，可与 rate 叠加）
 *   - minFee / maxFee 钳制：分账金额 = clamp(base*rate + fixedFee, min, max)
 *   - priority 优先级（高→优先匹配）
 *
 * 默认规则（DESIGN §七）：
 *   外卖：商户 0.85 / 骑手 0.10 / 平台 0.05
 *   跑腿：骑手 0.85 / 平台 0.15
 */
export class CreateSettlementRuleDto {
  @ApiProperty({ description: '规则编码（业务可识别，唯一）', example: 'TAKEOUT_MERCHANT_85' })
  @IsString()
  @Length(2, 64)
  ruleCode!: string

  @ApiProperty({ description: '规则名称', example: '外卖商户 85% 全局' })
  @IsString()
  @Length(2, 128)
  ruleName!: string

  @ApiProperty({ description: '场景：1 外卖 / 2 跑腿', enum: SCENE_VALUES, example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsIn(SCENE_VALUES, { message: 'scene 取值非法' })
  scene!: SettlementRuleScene

  @ApiProperty({
    description: '分账对象：1 商户 / 2 骑手 / 3 平台',
    enum: TARGET_TYPE_VALUES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(TARGET_TYPE_VALUES, { message: 'targetType 取值非法' })
  targetType!: SettlementTargetType

  @ApiProperty({
    description: '生效范围：1 全局 / 2 城市 / 3 单店',
    enum: SCOPE_TYPE_VALUES,
    example: 1
  })
  @Type(() => Number)
  @IsInt()
  @IsIn(SCOPE_TYPE_VALUES, { message: 'scopeType 取值非法' })
  scopeType!: SettlementScopeType

  @ApiPropertyOptional({
    description: '范围值（scope_type=2 填 city_code；scope_type=3 填 shop_id；scope_type=1 不传）'
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  scopeValue?: string

  @ApiProperty({
    description: '比例（0~1，例 0.85）；4 位小数字符串',
    example: '0.8500'
  })
  @IsString()
  @IsDecimal({ decimal_digits: '0,4' }, { message: 'rate 必须为最多 4 位小数的字符串' })
  rate!: string

  @ApiPropertyOptional({ description: '固定费（元，2 位小数字符串）默认 0.00', example: '0.00' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'fixedFee 必须为最多 2 位小数的字符串' })
  fixedFee?: string

  @ApiPropertyOptional({ description: '最低分账金额（元）' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'minFee 必须为最多 2 位小数的字符串' })
  minFee?: string

  @ApiPropertyOptional({ description: '最高分账金额（元）' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'maxFee 必须为最多 2 位小数的字符串' })
  maxFee?: string

  @ApiPropertyOptional({ description: '优先级（大→优先匹配），默认 0', example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  priority?: number

  @ApiPropertyOptional({ description: '生效起始（ISO8601；不传=立即生效）' })
  @IsOptional()
  @IsDateString()
  validFrom?: string

  @ApiPropertyOptional({ description: '失效时间（ISO8601；不传=长期）' })
  @IsOptional()
  @IsDateString()
  validTo?: string

  @ApiPropertyOptional({
    description: '状态：0 停用 / 1 启用，默认 1',
    enum: RULE_STATUS_VALUES as unknown as number[]
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(RULE_STATUS_VALUES as unknown as number[])
  status?: number
}

/* ============================================================================
 * 二、UpdateSettlementRuleDto —— 编辑规则入参（部分字段）
 * ============================================================================ */

/**
 * 编辑分账规则入参（管理端 PUT /admin/settlement-rules/:id）
 * 不允许改 ruleCode（业务编码）；其余字段可选
 */
export class UpdateSettlementRuleDto {
  @ApiPropertyOptional({ description: '规则名称' })
  @IsOptional()
  @IsString()
  @Length(2, 128)
  ruleName?: string

  @ApiPropertyOptional({ description: '比例（0~1）', example: '0.8000' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,4' })
  rate?: string

  @ApiPropertyOptional({ description: '固定费（元）' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  fixedFee?: string

  @ApiPropertyOptional({ description: '最低分账金额' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  minFee?: string

  @ApiPropertyOptional({ description: '最高分账金额' })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  maxFee?: string

  @ApiPropertyOptional({ description: '优先级' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number

  @ApiPropertyOptional({ description: '生效起始（ISO8601）' })
  @IsOptional()
  @IsDateString()
  validFrom?: string

  @ApiPropertyOptional({ description: '失效时间（ISO8601）' })
  @IsOptional()
  @IsDateString()
  validTo?: string

  @ApiPropertyOptional({
    description: '状态：0 停用 / 1 启用',
    enum: RULE_STATUS_VALUES as unknown as number[]
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(RULE_STATUS_VALUES as unknown as number[])
  status?: number

  @ApiPropertyOptional({ description: '范围值（仅 scope_type=2/3 有效；编辑时同步修改）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  scopeValue?: string
}

/* ============================================================================
 * 三、QuerySettlementRuleDto —— 规则列表查询
 * ============================================================================ */

/**
 * 规则列表查询入参（管理端 GET /admin/settlement-rules）
 */
export class QuerySettlementRuleDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '场景筛选', enum: SCENE_VALUES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(SCENE_VALUES)
  scene?: SettlementRuleScene

  @ApiPropertyOptional({ description: '目标类型筛选', enum: TARGET_TYPE_VALUES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(TARGET_TYPE_VALUES)
  targetType?: SettlementTargetType

  @ApiPropertyOptional({ description: '范围类型筛选', enum: SCOPE_TYPE_VALUES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(SCOPE_TYPE_VALUES)
  scopeType?: SettlementScopeType

  @ApiPropertyOptional({
    description: '状态：0 停用 / 1 启用',
    enum: RULE_STATUS_VALUES as unknown as number[]
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(RULE_STATUS_VALUES as unknown as number[])
  status?: number

  @ApiPropertyOptional({ description: '规则编码模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ruleCode?: string
}

/* ============================================================================
 * 四、SettlementRuleVo —— 规则视图
 * ============================================================================ */

/**
 * 分账规则视图对象
 */
export class SettlementRuleVo {
  @ApiProperty({ description: '主键' })
  id!: string

  @ApiProperty({ description: '规则编码' })
  ruleCode!: string

  @ApiProperty({ description: '规则名称' })
  ruleName!: string

  @ApiProperty({ description: '场景：1 外卖 / 2 跑腿', enum: SCENE_VALUES })
  scene!: SettlementRuleScene

  @ApiProperty({ description: '目标类型', enum: TARGET_TYPE_VALUES })
  targetType!: SettlementTargetType

  @ApiProperty({ description: '范围类型', enum: SCOPE_TYPE_VALUES })
  scopeType!: SettlementScopeType

  @ApiProperty({ description: '范围值', nullable: true })
  scopeValue!: string | null

  @ApiProperty({ description: '比例（0~1，4 位小数字符串）' })
  rate!: string

  @ApiProperty({ description: '固定费（元）' })
  fixedFee!: string

  @ApiProperty({ description: '最低分账金额', nullable: true })
  minFee!: string | null

  @ApiProperty({ description: '最高分账金额', nullable: true })
  maxFee!: string | null

  @ApiProperty({ description: '优先级' })
  priority!: number

  @ApiProperty({ description: '生效起始', nullable: true })
  validFrom!: Date | null

  @ApiProperty({ description: '失效时间', nullable: true })
  validTo!: Date | null

  @ApiProperty({ description: '状态：0 停用 / 1 启用' })
  status!: number

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}

/* ============================================================================
 * 五、SettlementRecordVo + 查询 DTO
 * ============================================================================ */

/**
 * 分账记录视图对象
 */
export class SettlementRecordVo {
  @ApiProperty({ description: '主键' })
  id!: string

  @ApiProperty({ description: '分账单号', example: 'ST20260420000001' })
  settlementNo!: string

  @ApiProperty({ description: '关联订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型：1 外卖 / 2 跑腿', example: 1 })
  orderType!: number

  @ApiProperty({ description: '目标类型', enum: TARGET_TYPE_VALUES })
  targetType!: SettlementTargetType

  @ApiProperty({ description: '目标 ID（target_type=3 平台时为 null）', nullable: true })
  targetId!: string | null

  @ApiProperty({ description: '匹配规则 ID' })
  ruleId!: string

  @ApiProperty({ description: '基数金额（订单 payAmount）' })
  baseAmount!: string

  @ApiProperty({ description: '使用比例' })
  rate!: string

  @ApiProperty({ description: '使用固定费' })
  fixedFee!: string

  @ApiProperty({ description: '实际分账金额' })
  settleAmount!: string

  @ApiProperty({ description: '状态', enum: RECORD_STATUS_VALUES })
  status!: SettleStatus

  @ApiProperty({ description: '执行时间', nullable: true })
  settleAt!: Date | null

  @ApiProperty({ description: '账户流水号', nullable: true })
  flowNo!: string | null

  @ApiProperty({ description: '失败原因', nullable: true })
  errorMsg!: string | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date
}

/**
 * 分账记录查询入参（管理端 GET /admin/settlement-records）
 */
export class QuerySettlementRecordDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '订单号精确查询' })
  @IsOptional()
  @IsString()
  @Length(18, 18)
  orderNo?: string

  @ApiPropertyOptional({ description: '订单类型', enum: SCENE_VALUES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(SCENE_VALUES)
  orderType?: number

  @ApiPropertyOptional({ description: '目标类型', enum: TARGET_TYPE_VALUES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(TARGET_TYPE_VALUES)
  targetType?: SettlementTargetType

  @ApiPropertyOptional({ description: '目标 ID（精确）' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  targetId?: string

  @ApiPropertyOptional({ description: '状态', enum: RECORD_STATUS_VALUES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(RECORD_STATUS_VALUES)
  status?: SettleStatus
}

/* ============================================================================
 * 六、RunOnceDto —— 手动触发分账
 * ============================================================================ */

/**
 * 手动触发分账入参（管理端 POST /admin/settlement/run-once）
 *
 * 用途：运维补跑历史日期的分账（如 cron 失败、对账差异修复等）
 */
export class RunOnceDto {
  @ApiProperty({
    description: '业务日期 yyyyMMdd（按订单 finished_at 该日 00:00 ~ 次日 00:00 范围扫描）',
    example: '20260418'
  })
  @IsString()
  @Length(8, 8, { message: 'date 必须 8 位 yyyyMMdd' })
  date!: string
}

/**
 * 手动触发分账响应
 */
export class RunOnceResultVo {
  @ApiProperty({ description: '业务日期 yyyyMMdd' })
  date!: string

  @ApiProperty({ description: '本次扫描订单数（外卖+跑腿）' })
  scannedOrders!: number

  @ApiProperty({ description: '本次新建分账记录条数' })
  createdRecords!: number

  @ApiProperty({ description: '本次成功执行（status→1）的记录数' })
  executedRecords!: number

  @ApiProperty({ description: '本次失败（status→2）的记录数' })
  failedRecords!: number

  @ApiProperty({ description: '本次跳过（已存在）的记录数' })
  skippedRecords!: number
}
