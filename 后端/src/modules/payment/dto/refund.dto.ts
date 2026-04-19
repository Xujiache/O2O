/**
 * @file refund.dto.ts
 * @stage P4/T4.27 + T4.28（Sprint 4）
 * @desc 退款 + 对账 DTO：CreateRefundDto / RefundVo / RefundNotifyDto / ReconQueryDto / ReconRunDto
 * @author 单 Agent V2.0（Subagent 3 Payment）
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
  Matches,
  MaxLength,
  Min
} from 'class-validator'
import { PageQueryDto } from '@/common'
import { RefundStatus, type PayChannelKey } from '../types/payment.types'

/* ============================================================================
 * 1. 创建退款（管理端 / Order Saga 触发）
 * ============================================================================ */

/**
 * 创建退款入参
 * 用途：POST /admin/refund/create
 *      RefundService.createRefund(input) 内部调用同样字段
 */
export class CreateRefundDto {
  @ApiProperty({ description: '原平台支付单号（28 位）' })
  @IsString()
  @Length(28, 28, { message: 'payNo 必须为 28 位' })
  @Matches(/^P\d{27}$/, { message: 'payNo 必须形如 P + 27 位数字' })
  payNo!: string

  @ApiProperty({ description: '本次退款金额（string，两位小数）', example: '10.00' })
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'amount 必须为两位小数 string' })
  amount!: string

  @ApiProperty({ description: '退款原因', example: '用户取消订单' })
  @IsString()
  @Length(1, 255)
  reason!: string

  @ApiPropertyOptional({ description: '关联售后单号' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  afterSaleNo?: string
}

/* ============================================================================
 * 2. 退款响应
 * ============================================================================ */

/**
 * 退款响应
 */
export class RefundVo {
  @ApiProperty({ description: '退款单号（28 位，R 开头）' })
  refundNo!: string

  @ApiProperty({ description: '原支付单号' })
  payNo!: string

  @ApiProperty({ description: '本次退款金额' })
  amount!: string

  @ApiProperty({
    description: '退款状态：0 申请 / 1 处理中 / 2 成功 / 3 失败',
    example: RefundStatus.PROCESSING
  })
  status!: number

  @ApiPropertyOptional({ description: '第三方退款号', nullable: true })
  outRefundNo!: string | null

  @ApiPropertyOptional({
    description: '余额退款返回（仅余额支付场景）',
    type: 'object',
    additionalProperties: true,
    nullable: true
  })
  balanceResult?: Record<string, unknown> | null
}

/* ============================================================================
 * 3. 退款回调路径参数
 * ============================================================================ */

/**
 * 退款回调路径参数：channel=wxpay/alipay
 */
export class RefundNotifyChannelDto {
  @ApiProperty({ description: '渠道', enum: ['wxpay', 'alipay'] })
  @IsString()
  @IsIn(['wxpay', 'alipay'], { message: 'channel 仅支持 wxpay/alipay' })
  channel!: PayChannelKey
}

/* ============================================================================
 * 4. 对账：手动触发入参
 * ============================================================================ */

/**
 * 管理端手动对账入参
 * 用途：POST /admin/reconciliation/run
 */
export class RunReconciliationDto {
  @ApiProperty({ description: '渠道', enum: ['wxpay', 'alipay'] })
  @IsString()
  @IsIn(['wxpay', 'alipay'])
  channel!: PayChannelKey

  @ApiProperty({ description: '对账日（YYYY-MM-DD）', example: '2026-04-18' })
  @IsDateString({ strict: true }, { message: 'billDate 必须为 YYYY-MM-DD 字符串' })
  billDate!: string
}

/* ============================================================================
 * 5. 对账：分页查询
 * ============================================================================ */

/**
 * 对账记录分页查询
 * 用途：GET /admin/reconciliations
 */
export class QueryReconciliationDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '渠道过滤', enum: ['wxpay', 'alipay'] })
  @IsOptional()
  @IsString()
  @IsIn(['wxpay', 'alipay'])
  channel?: PayChannelKey

  @ApiPropertyOptional({ description: '对账日（YYYY-MM-DD）' })
  @IsOptional()
  @IsDateString({ strict: true })
  billDate?: string

  @ApiPropertyOptional({
    description: '状态过滤：0 待对 / 1 已对平 / 2 有差异 / 3 处理中 / 4 已处理'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  status?: number
}

/* ============================================================================
 * 6. 对账记录视图
 * ============================================================================ */

/**
 * 对账记录响应
 */
export class ReconciliationVo {
  @ApiProperty({ description: '主键' })
  id!: string

  @ApiProperty({ description: '对账单号' })
  reconNo!: string

  @ApiProperty({ description: '渠道' })
  channel!: string

  @ApiProperty({ description: '对账日（YYYY-MM-DD）' })
  billDate!: string

  @ApiProperty({ description: '平台侧订单总数' })
  totalOrders!: number

  @ApiProperty({ description: '平台侧总金额' })
  totalAmount!: string

  @ApiProperty({ description: '渠道手续费合计' })
  totalFee!: string

  @ApiProperty({ description: '渠道侧订单数' })
  channelOrders!: number

  @ApiProperty({ description: '渠道侧金额' })
  channelAmount!: string

  @ApiProperty({ description: '差异笔数' })
  diffCount!: number

  @ApiProperty({ description: '差异金额' })
  diffAmount!: string

  @ApiProperty({
    description: '状态：0 待对 / 1 已对平 / 2 有差异 / 3 处理中 / 4 已处理'
  })
  status!: number

  @ApiPropertyOptional({ description: '渠道对账文件 URL', nullable: true })
  billFileUrl!: string | null

  @ApiPropertyOptional({ description: '差异明细 URL', nullable: true })
  diffFileUrl!: string | null

  @ApiPropertyOptional({ description: '处理完成时间', nullable: true })
  finishAt!: Date | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date
}
