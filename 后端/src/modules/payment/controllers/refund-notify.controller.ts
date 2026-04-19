/**
 * @file refund-notify.controller.ts
 * @stage P4/T4.27（Sprint 4）
 * @desc 退款回调接口（@Public，支持 wxpay/alipay）
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 路由：POST /payment/refund/notify/:channel
 *   - channel=wxpay  → 微信退款回调
 *   - channel=alipay → 支付宝退款回调
 *
 * 鉴权：@Public()
 *
 * 返回：
 *   - 微信：{"code":"SUCCESS"}
 *   - 支付宝：'success' 字符串
 */

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post
} from '@nestjs/common'
import { ApiOperation, ApiResponse as ApiSwaggerResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '@/modules/auth/decorators'
import { RefundNotifyChannelDto } from '../dto/refund.dto'
import { RefundService } from '../services/refund.service'

@ApiTags('内部 / 第三方 - 退款回调')
@Controller('payment/refund/notify')
export class RefundNotifyController {
  private readonly logger = new Logger(RefundNotifyController.name)

  constructor(private readonly refundService: RefundService) {}

  /**
   * 退款回调
   * 路径：POST /payment/refund/notify/:channel
   * 入参：channel ('wxpay' | 'alipay') + raw headers + body
   * 返回：根据 channel 返回 {"code":"SUCCESS"} 或 'success' 字符串
   */
  @Post(':channel')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '退款回调（wxpay / alipay）',
    description: '签名校验通过后更新 refund_record 状态 + 转 payment_record 至 5 已退款'
  })
  @ApiSwaggerResponse({ status: 200 })
  async notify(
    @Param() params: RefundNotifyChannelDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown
  ): Promise<string | { code: 'SUCCESS' | 'FAIL'; message?: string }> {
    const channel = params.channel
    const result = await this.refundService.handleRefundNotify(channel, headers, body)
    if (channel === 'wxpay') {
      return result.ok
        ? { code: 'SUCCESS' }
        : { code: 'FAIL', message: result.reason ?? '退款回调处理失败' }
    }
    /* alipay 规范：success/fail */
    if (!result.ok) {
      this.logger.warn(`[REFUND-NOTIFY] alipay 失败：${result.reason}`)
    }
    return result.ok ? 'success' : 'fail'
  }
}
