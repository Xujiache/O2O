/**
 * @file payment.controller.ts
 * @stage P4/T4.24 + T4.26（Sprint 4）
 * @desc 用户端支付接口
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 路由：
 *   - POST /payment/create     创建支付（返回前端唤起参数 / 余额支付一步到位）
 *   - GET  /payment/:payNo/status  查询支付状态（owner=user_id===uid）
 *
 * 鉴权：@UserTypes('user') + JwtAuthGuard + UserTypeGuard
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { CurrentUser, UserTypes, type AuthUser } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import {
  CreatePaymentDto,
  PaymentPayNoParamDto,
  PaymentStatusVo,
  PaymentVo
} from '../dto/payment.dto'
import { PayMethod, type PayerClientType } from '../types/payment.types'
import { PaymentService } from '../services/payment.service'

@ApiTags('用户端 - 支付')
@ApiBearerAuth()
@Controller('payment')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * 创建支付
   * 入参：CreatePaymentDto
   * 返回：PaymentVo（含 prepayParams 给前端唤起 / mockMode 标识）
   * 用途：POST /api/v1/payment/create
   */
  @Post('create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '创建支付',
    description: '生成支付单 + 调对应渠道 adapter；余额支付直接 SUCCESS，三方支付返回前端唤起参数'
  })
  @ApiSwaggerResponse({ status: 200, type: PaymentVo })
  async create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser): Promise<PaymentVo> {
    const result = await this.paymentService.create({
      orderNo: dto.orderNo,
      orderType: dto.orderType,
      userId: user.uid,
      amount: dto.amount,
      payMethod: dto.payMethod as PayMethod,
      payerClientType: dto.payerClientType as PayerClientType | undefined,
      openId: dto.openId,
      clientIp: dto.clientIp,
      description: dto.description
    })
    return {
      payNo: result.payNo,
      payMethod: result.payMethod,
      status: result.status,
      amount: result.amount,
      prepayParams: result.prepayParams,
      mockMode: result.mockMode,
      balanceResult: result.balanceResult as Record<string, unknown> | undefined
    }
  }

  /**
   * 查询支付状态
   * 路径参数：payNo（28 位）
   * 返回：PaymentStatusVo
   */
  @Get(':payNo/status')
  @ApiOperation({ summary: '查询支付状态（owner 校验）' })
  @ApiSwaggerResponse({ status: 200, type: PaymentStatusVo })
  async queryStatus(
    @Param() params: PaymentPayNoParamDto,
    @CurrentUser() user: AuthUser
  ): Promise<PaymentStatusVo> {
    const info = await this.paymentService.queryStatus(params.payNo, user.uid)
    return {
      payNo: info.payNo,
      orderNo: info.orderNo,
      orderType: info.orderType,
      amount: info.amount,
      payMethod: info.payMethod,
      status: info.status,
      payAt: info.payAt,
      outTradeNo: info.outTradeNo,
      channel: info.channel
    }
  }
}
