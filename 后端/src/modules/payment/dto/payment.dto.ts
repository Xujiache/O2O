/**
 * @file payment.dto.ts
 * @stage P4/T4.24~T4.26（Sprint 4）
 * @desc 支付 DTO：CreatePaymentDto / PaymentVo / PaymentStatusVo
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 所有金额一律 string + IsDecimal；payMethod / payerClientType 用 IsIn 限定
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
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
import { PayMethod, PayStatus, type PayerClientType } from '../types/payment.types'

/* ============================================================================
 * 1. 创建支付入参（用户端）
 * ============================================================================ */

/**
 * 创建支付入参
 * 用途：POST /payment/create
 */
export class CreatePaymentDto {
  @ApiProperty({ description: '订单号（18 位）', example: '180000000000000001' })
  @IsString()
  @Length(18, 18, { message: 'orderNo 必须为 18 位' })
  orderNo!: string

  @ApiProperty({
    description: '订单类型：1 外卖 / 2 跑腿',
    enum: [1, 2],
    example: 1
  })
  @IsInt()
  @IsIn([1, 2], { message: 'orderType 仅支持 1/2' })
  orderType!: number

  @ApiProperty({
    description: '支付金额（元，两位小数 string）',
    example: '12.50'
  })
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'amount 必须为两位小数 string' })
  amount!: string

  @ApiProperty({
    description: '支付方式：1 微信 / 2 支付宝 / 3 余额',
    enum: [1, 2, 3],
    example: 1
  })
  @IsInt()
  @IsIn([PayMethod.WX_PAY, PayMethod.ALIPAY, PayMethod.BALANCE], {
    message: 'payMethod 仅支持 1(微信)/2(支付宝)/3(余额)'
  })
  payMethod!: number

  @ApiPropertyOptional({
    description: '客户端类型：jsapi/app/native/wap（余额支付可空）',
    enum: ['jsapi', 'app', 'native', 'wap']
  })
  @IsOptional()
  @IsIn(['jsapi', 'app', 'native', 'wap'], {
    message: 'payerClientType 仅支持 jsapi/app/native/wap'
  })
  payerClientType?: PayerClientType

  @ApiPropertyOptional({ description: '微信 jsapi openId（小程序场景必传）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  openId?: string

  @ApiPropertyOptional({ description: '客户端 IP（部分渠道必传）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientIp?: string

  @ApiPropertyOptional({ description: '商品描述', example: '红烧牛肉面 ×1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string
}

/* ============================================================================
 * 2. 创建支付响应 VO
 * ============================================================================ */

/**
 * 创建支付响应
 */
export class PaymentVo {
  @ApiProperty({ description: '平台支付单号（28 位）', example: 'P20260419023015...' })
  payNo!: string

  @ApiProperty({ description: '支付方式（透传）', example: 1 })
  payMethod!: number

  @ApiProperty({
    description: '支付状态：0 创建 / 1 支付中 / 2 成功 / 3 失败 / 4 关闭 / 5 已退款',
    example: PayStatus.PAYING
  })
  status!: number

  @ApiProperty({ description: '金额（string 元）', example: '12.50' })
  amount!: string

  @ApiProperty({
    description: '前端唤起参数（结构因渠道而异；余额支付为空对象）',
    type: 'object',
    additionalProperties: true,
    example: { appId: 'mock-appid', timeStamp: '1703...' }
  })
  prepayParams!: Record<string, unknown>

  @ApiProperty({ description: 'adapter 是否处于 mock 模式', example: true })
  mockMode!: boolean

  @ApiPropertyOptional({
    description: '余额支付返回信息（仅 method=3 时填）',
    type: 'object',
    additionalProperties: true
  })
  balanceResult?: Record<string, unknown>
}

/* ============================================================================
 * 3. 查询支付状态 VO
 * ============================================================================ */

/**
 * 支付状态查询响应
 */
export class PaymentStatusVo {
  @ApiProperty({ description: '平台支付单号' })
  payNo!: string

  @ApiProperty({ description: '关联订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单类型：1 外卖 / 2 跑腿' })
  orderType!: number

  @ApiProperty({ description: '金额（string 元）' })
  amount!: string

  @ApiProperty({ description: '支付方式：1 微信 / 2 支付宝 / 3 余额' })
  payMethod!: number

  @ApiProperty({
    description: '支付状态：0 创建 / 1 支付中 / 2 成功 / 3 失败 / 4 关闭 / 5 已退款'
  })
  status!: number

  @ApiPropertyOptional({ description: '支付完成时间（ISO 字符串）', nullable: true })
  payAt!: Date | null

  @ApiPropertyOptional({ description: '第三方交易号', nullable: true })
  outTradeNo!: string | null

  @ApiPropertyOptional({ description: '渠道明细（如 wxpay_jsapi）', nullable: true })
  channel!: string | null
}

/* ============================================================================
 * 4. mock 回调 body（仅类型，controller 接 unknown 通过 validator 校验也可）
 * ============================================================================ */

/**
 * mock 模式回调 body（用于联调）
 * 真实模式 body 为加密报文，由 adapter 解密后产生标准化 payload
 */
export class MockNotifyBodyDto {
  @ApiPropertyOptional({ description: '支付单号' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  payNo?: string

  @ApiPropertyOptional({ description: '三方交易号' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  outTradeNo?: string

  @ApiPropertyOptional({ description: '金额（string）' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  amount?: string

  @ApiPropertyOptional({ description: '支付完成时间（ms）' })
  @IsOptional()
  @IsInt()
  paidAt?: number

  @ApiPropertyOptional({
    description: '规范化状态：SUCCESS / FAIL / CLOSED',
    enum: ['SUCCESS', 'FAIL', 'CLOSED']
  })
  @IsOptional()
  @IsIn(['SUCCESS', 'FAIL', 'CLOSED'])
  tradeStatus?: 'SUCCESS' | 'FAIL' | 'CLOSED'

  @ApiPropertyOptional({ description: '时间戳（s）；存在则校验防重放窗 5min' })
  @IsOptional()
  @IsInt()
  ts?: number

  @ApiPropertyOptional({ description: '随机串（防重放）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nonce?: string
}

/* ============================================================================
 * 5. 状态查询路径参数（payNo 28 位）
 * ============================================================================ */

/**
 * 路径参数：payNo（'P' + 8 + 6 + 13 = 28 位）
 */
export class PaymentPayNoParamDto {
  @ApiProperty({ description: '平台支付单号（28 位，P 开头）', example: 'P20260419023015...' })
  @IsString()
  @Length(28, 28, { message: 'payNo 必须为 28 位' })
  @Matches(/^P\d{27}$/, { message: 'payNo 必须形如 P + 27 位数字' })
  payNo!: string
}
