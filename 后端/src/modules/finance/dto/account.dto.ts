/**
 * @file account.dto.ts
 * @stage P4/T4.30（Sprint 5）
 * @desc Account / AccountFlow 相关 DTO（VO + 流水查询 + 调账入参）
 * @author 单 Agent V2.0
 *
 * 字段语义对齐 05_finance.sql：
 *   - account.balance / frozen / total_income / total_expense   DECIMAL(12/14, 2)
 *   - account_flow.direction / biz_type 详见 finance.types.ts 枚举常量
 *   - 金额字段一律 string，service 层 BigNumber 计算，禁止 number
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDecimal, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { PageQueryDto } from '@/common'
import {
  AccountOwnerTypeEnum,
  type AccountOwnerType,
  FlowBizTypeEnum,
  type FlowBizType,
  FlowDirectionEnum,
  type FlowDirection
} from '../types/finance.types'

/** 账户主体类型枚举值数组 */
const OWNER_TYPE_VALUES = Object.values(AccountOwnerTypeEnum) as number[]
/** 流水方向枚举值数组 */
const FLOW_DIRECTION_VALUES = Object.values(FlowDirectionEnum) as number[]
/** 流水业务类型枚举值数组 */
const FLOW_BIZ_TYPE_VALUES = Object.values(FlowBizTypeEnum) as number[]

/* ============================================================================
 * 一、AccountVo —— 账户视图
 * ============================================================================ */

/**
 * 账户视图对象
 * 用途：商户/骑手/用户端 GET /finance/overview 返回主体
 */
export class AccountVo {
  @ApiProperty({ description: '账户主键（雪花字符串）' })
  id!: string

  @ApiProperty({ description: '主体类型：1 用户 / 2 商户 / 3 骑手', enum: OWNER_TYPE_VALUES })
  ownerType!: AccountOwnerType

  @ApiProperty({ description: '主体 ID（user.id / merchant.id / rider.id）' })
  ownerId!: string

  @ApiProperty({ description: '可用余额（元，2 位小数字符串）', example: '128.50' })
  balance!: string

  @ApiProperty({ description: '冻结金额（元）', example: '50.00' })
  frozen!: string

  @ApiProperty({ description: '累计收入（元）', example: '12345.67' })
  totalIncome!: string

  @ApiProperty({ description: '累计支出（元）', example: '6789.00' })
  totalExpense!: string

  @ApiProperty({ description: '账户状态：0 冻结 / 1 正常', example: 1 })
  status!: number

  @ApiProperty({ description: '乐观锁版本号（前端调试可见，提交时无需回传）' })
  version!: number

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date
}

/* ============================================================================
 * 二、FlowVo —— 流水视图
 * ============================================================================ */

/**
 * 账户流水视图对象
 * 用途：账户流水列表
 */
export class FlowVo {
  @ApiProperty({ description: '流水主键' })
  id!: string

  @ApiProperty({ description: '流水号（业务可定位）', example: 'AF20260420000001' })
  flowNo!: string

  @ApiProperty({ description: '账户 ID' })
  accountId!: string

  @ApiProperty({ description: '主体类型', enum: OWNER_TYPE_VALUES })
  ownerType!: AccountOwnerType

  @ApiProperty({ description: '主体 ID' })
  ownerId!: string

  @ApiProperty({
    description: '方向：1 入账 / 2 出账',
    enum: FLOW_DIRECTION_VALUES,
    example: 1
  })
  direction!: FlowDirection

  @ApiProperty({
    description:
      '业务类型：1 订单收入 / 2 订单退款 / 3 分账 / 4 提现 / 5 充值 / 6 奖励 / 7 罚款 / 8 调整',
    enum: FLOW_BIZ_TYPE_VALUES,
    example: 3
  })
  bizType!: FlowBizType

  @ApiProperty({ description: '发生额（始终正数；方向看 direction）', example: '85.00' })
  amount!: string

  @ApiProperty({ description: '操作后余额', example: '213.50' })
  balanceAfter!: string

  @ApiProperty({ description: '关联业务单号（订单号/支付号/分账号/提现号）', nullable: true })
  relatedNo!: string | null

  @ApiProperty({ description: '备注', nullable: true })
  remark!: string | null

  @ApiProperty({ description: '操作管理员 ID（biz_type=8 调账时）', nullable: true })
  opAdminId!: string | null

  @ApiProperty({ description: '创建时间（即流水时间）' })
  createdAt!: Date
}

/* ============================================================================
 * 三、FlowQueryDto —— 流水分页查询入参
 * ============================================================================ */

/**
 * 账户流水分页查询入参
 * 用途：商户/骑手/用户端 GET /finance/flows
 *      管理端 GET /admin/accounts/:id/flows 复用
 */
export class FlowQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description:
      '业务类型筛选：1 订单收入 / 2 订单退款 / 3 分账 / 4 提现 / 5 充值 / 6 奖励 / 7 罚款 / 8 调整',
    enum: FLOW_BIZ_TYPE_VALUES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'bizType 必须为整数' })
  @IsIn(FLOW_BIZ_TYPE_VALUES, { message: 'bizType 取值非法' })
  bizType?: FlowBizType

  @ApiPropertyOptional({
    description: '方向筛选：1 入账 / 2 出账',
    enum: FLOW_DIRECTION_VALUES
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'direction 必须为整数' })
  @IsIn(FLOW_DIRECTION_VALUES, { message: 'direction 取值非法' })
  direction?: FlowDirection
}

/* ============================================================================
 * 四、AdjustBalanceDto —— 管理端人工调账
 * ============================================================================ */

/**
 * 人工调账入参（管理端 POST /admin/accounts/:accountId/adjust）
 * 用途：客服补偿、误扣回补、平台手工分账修正等场景
 *
 * 注意：
 *   - amount 始终正数；direction 决定加减
 *   - 写入 account_flow biz_type=8 调整 + op_admin_id 留痕
 *   - 必走 OperationLog
 */
export class AdjustBalanceDto {
  @ApiProperty({
    description: '方向：1 入账（加余额）/ 2 出账（减余额）',
    enum: FLOW_DIRECTION_VALUES,
    example: 1
  })
  @Type(() => Number)
  @IsInt({ message: 'direction 必须为整数' })
  @IsIn(FLOW_DIRECTION_VALUES, { message: 'direction 必须为 1 或 2' })
  direction!: FlowDirection

  @ApiProperty({ description: '调账金额（元，2 位小数字符串，正数）', example: '50.00' })
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'amount 必须为最多 2 位小数的字符串' })
  amount!: string

  @ApiProperty({ description: '调账原因（必填，留档审计）', example: '客服补偿订单 T2026...' })
  @IsString()
  @MaxLength(255, { message: 'remark 长度不能超过 255' })
  remark!: string

  @ApiPropertyOptional({ description: '关联业务单号（如订单号 / 客服工单号）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  relatedNo?: string
}

/* ============================================================================
 * 五、AccountListQueryDto —— 管理端账户查询（备用，不在本期路由暴露但 service 留接口）
 * ============================================================================ */

/**
 * 账户分页查询入参（管理端 GET /admin/accounts 备用接口）
 * 字段：可选 ownerType + ownerId 精确查
 */
export class AccountListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '主体类型', enum: OWNER_TYPE_VALUES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(OWNER_TYPE_VALUES)
  ownerType?: AccountOwnerType

  @ApiPropertyOptional({ description: '主体 ID（精确）' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ownerId?: string

  @ApiPropertyOptional({ description: '账户状态：0 冻结 / 1 正常' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  status?: number
}
