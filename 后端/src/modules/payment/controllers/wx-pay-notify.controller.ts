/**
 * @file wx-pay-notify.controller.ts
 * @stage P4/T4.24（Sprint 4）
 * @desc 微信支付 V3 回调接口（@Public）
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 路由：POST /payment/wx/notify
 * 鉴权：@Public()（第三方回调不带 JWT；adapter.verifyNotify 内部校验签名 + 防重放）
 * 返回：成功 → {"code":"SUCCESS"}（微信 V3 规范）
 *        失败 → {"code":"FAIL", "message": "..."}（微信会按规则重试）
 *
 * 设计：
 *   1) adapter.verifyNotify({headers, body})
 *   2) 通过 → state machine transit(payNo, 'PaymentSucceed' | 'PaymentFailed' | 'PaymentClosed')
 *   3) 返回 200 + {"code":"SUCCESS"}
 */

import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse as ApiSwaggerResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '@/modules/auth/decorators'
import { WxPayAdapter } from '../adapters/wx-pay.adapter'
import { PaymentStateMachine } from '../services/payment-state-machine'

@ApiTags('内部 / 第三方 - 微信支付回调')
@Controller('payment/wx')
export class WxPayNotifyController {
  private readonly logger = new Logger(WxPayNotifyController.name)

  constructor(
    private readonly wxAdapter: WxPayAdapter,
    private readonly stateMachine: PaymentStateMachine
  ) {}

  /**
   * 微信支付回调
   * 入参：raw headers + body（V3 加密报文 / mock JSON）
   * 返回：{"code":"SUCCESS"} / {"code":"FAIL","message":"..."}
   *
   * 注意：本接口必须 @Public 跳过 JwtAuthGuard
   */
  @Post('notify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '微信支付回调（V3）',
    description: '签名校验通过后驱动 state machine 0/1 → 2 / 3 / 4'
  })
  @ApiSwaggerResponse({
    status: 200,
    description: '微信 V3 规范返回 {"code":"SUCCESS"} 或 {"code":"FAIL","message":"..."}'
  })
  async notify(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ): Promise<{ code: 'SUCCESS' | 'FAIL'; message?: string }> {
    const verify = this.wxAdapter.verifyNotify({ headers, body })
    if (!verify.ok || !verify.payload) {
      this.logger.warn(`[WX-NOTIFY] verify 失败：${verify.reason}`)
      return { code: 'FAIL', message: verify.reason ?? '验签失败' }
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
        extra: { source: 'wx-notify', tradeStatus: payload.tradeStatus }
      })
      this.logger.log(
        `[WX-NOTIFY] ok payNo=${payload.payNo} event=${event} ${r.from}→${r.to} idempotent=${r.idempotent}`
      )
    } catch (err) {
      const msg = (err as Error).message
      this.logger.error(`[WX-NOTIFY] state transit 失败 payNo=${payload.payNo}：${msg}`)
      return { code: 'FAIL', message: msg }
    }

    return { code: 'SUCCESS' }
  }
}
