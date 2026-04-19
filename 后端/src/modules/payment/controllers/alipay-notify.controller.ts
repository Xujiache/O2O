/**
 * @file alipay-notify.controller.ts
 * @stage P4/T4.25（Sprint 4）
 * @desc 支付宝回调接口（@Public）
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 路由：POST /payment/alipay/notify
 * 鉴权：@Public()（第三方回调不带 JWT；adapter.verifyNotify 内部校验签名 + 防重放）
 * 返回：成功 → 'success'（支付宝规范是字符串）
 *        失败 → 'fail'
 *
 * 注意：支付宝规范 body 通常是 application/x-www-form-urlencoded；NestJS 默认
 *       已开启 urlencoded 中间件，能解析为 plain object 传给 @Body()。
 */

import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse as ApiSwaggerResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '@/modules/auth/decorators'
import { AlipayAdapter } from '../adapters/alipay.adapter'
import { PaymentStateMachine } from '../services/payment-state-machine'

@ApiTags('内部 / 第三方 - 支付宝回调')
@Controller('payment/alipay')
export class AlipayNotifyController {
  private readonly logger = new Logger(AlipayNotifyController.name)

  constructor(
    private readonly alipayAdapter: AlipayAdapter,
    private readonly stateMachine: PaymentStateMachine
  ) {}

  /**
   * 支付宝回调
   * 入参：raw headers + body
   * 返回：'success' / 'fail'（字符串，支付宝规范）
   */
  @Post('notify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '支付宝回调',
    description: '签名校验通过后驱动 state machine 0/1 → 2 / 3 / 4；返回 success 字符串'
  })
  @ApiSwaggerResponse({
    status: 200,
    description: '支付宝规范返回 success / fail 字符串'
  })
  async notify(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ): Promise<string> {
    const verify = this.alipayAdapter.verifyNotify({ headers, body })
    if (!verify.ok || !verify.payload) {
      this.logger.warn(`[ALIPAY-NOTIFY] verify 失败：${verify.reason}`)
      return 'fail'
    }

    const payload = verify.payload
    let event: 'PaymentSucceed' | 'PaymentFailed' | 'PaymentClosed' = 'PaymentSucceed'
    if (payload.tradeStatus === 'FAIL') event = 'PaymentFailed'
    if (payload.tradeStatus === 'CLOSED') event = 'PaymentClosed'

    try {
      const r = await this.stateMachine.transit(payload.payNo, event, {
        outTradeNo: payload.outTradeNo,
        paidAt: payload.paidAt,
        rawResponse: payload.raw,
        extra: { source: 'alipay-notify', tradeStatus: payload.tradeStatus }
      })
      this.logger.log(
        `[ALIPAY-NOTIFY] ok payNo=${payload.payNo} event=${event} ${r.from}→${r.to} idempotent=${r.idempotent}`
      )
    } catch (err) {
      this.logger.error(
        `[ALIPAY-NOTIFY] state transit 失败 payNo=${payload.payNo}：${(err as Error).message}`
      )
      return 'fail'
    }

    return 'success'
  }
}
