/**
 * @file payment-callback.controller.ts
 * @stage P9/W3.C.3 (Sprint 3) — 第三方支付真实回调入口
 * @desc 与 P4 阶段 mock 回调（wx-pay-notify.controller / alipay-notify.controller）并存：
 *         本 controller 走"真实 provider"链路；前者走 mock。
 *
 * 路由：
 *   - POST /payment/callback/wechat   → WechatPayV3Provider.verifyCallback → state machine
 *   - POST /payment/callback/alipay   → AlipayProvider.verifyAsyncNotify   → state machine
 *
 * 鉴权：@Public()（第三方回调不带 JWT；provider 内部已校验签名/防重放）
 *
 * Raw body 注意：
 *   微信 V3 回调签名计算需要"未被任何中间件改写过"的原始 JSON 字符串。
 *   NestJS 默认 Express body parser 会解析为对象，回 JSON.stringify(obj) 字段顺序可能与原文不一致 → 验签失败。
 *
 *   P9 Sprint 3 集成时 Agent A 已在 main.ts 开启：
 *     await NestFactory.create(AppModule, { rawBody: true })
 *   controller 内 @Req() 读取 (req as RawBodyRequest<Request>).rawBody.toString('utf8')；
 *   缺失时退化为 JSON.stringify(body)（仅 mock / 内网联调用，生产以 rawBody 为准）。
 *
 * @author Agent C (P9 Sprint 3)
 */

import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common'
import { ApiOperation, ApiResponse as ApiSwaggerResponse, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { Public } from '@/modules/auth/decorators'
import { PaymentStateMachine } from '../services/payment-state-machine'
import { AlipayProvider, WechatPayV3Provider, type WechatPayCallbackHeaders } from '../providers'

/**
 * 类型守卫：从 Express request 拿 raw body buffer（需 main.ts `rawBody: true`）
 * 参数：req Express Request
 * 返回值：raw body utf8 字符串；缺失返回 null
 */
function getRawBody(req: Request): string | null {
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody
  if (raw && Buffer.isBuffer(raw)) return raw.toString('utf8')
  return null
}

@ApiTags('内部 / 第三方 - 真实支付回调')
@Controller('payment/callback')
export class PaymentCallbackController {
  private readonly logger = new Logger(PaymentCallbackController.name)

  constructor(
    private readonly wechatProvider: WechatPayV3Provider,
    private readonly alipayProvider: AlipayProvider,
    private readonly stateMachine: PaymentStateMachine
  ) {}

  /* ============================================================================
   * 1. 微信支付 V3 回调
   * ============================================================================ */

  /**
   * 微信支付 V3 异步回调
   * 入参：
   *   - headers   wechatpay-timestamp / nonce / signature / serial
   *   - body      原始 JSON（含 resource.ciphertext）
   * 返回：
   *   - 200 + { code: 'SUCCESS', message: 'OK' }     → 微信不会重试
   *   - 200 + { code: 'FAIL', message: '...' }       → 微信会按规则重试
   */
  @Post('wechat')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '微信支付 V3 异步回调（真实链路）',
    description: 'WechatPayV3Provider.verifyCallback → state machine 推进；与 P4 mock 接口并存'
  })
  @ApiSwaggerResponse({
    status: 200,
    description: '{"code":"SUCCESS","message":"OK"} / {"code":"FAIL"...}'
  })
  async wechat(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Req() req: Request
  ): Promise<{ code: 'SUCCESS' | 'FAIL'; message: string }> {
    /* 取签名头（小写） */
    const callbackHeaders: WechatPayCallbackHeaders = {
      'wechatpay-timestamp': pickHeader(headers, 'wechatpay-timestamp'),
      'wechatpay-nonce': pickHeader(headers, 'wechatpay-nonce'),
      'wechatpay-signature': pickHeader(headers, 'wechatpay-signature'),
      'wechatpay-serial': pickHeader(headers, 'wechatpay-serial')
    }

    /* 优先读 raw body（main.ts 需 rawBody:true）；缺失退化为 JSON.stringify */
    const rawBody = getRawBody(req)
    const bodyStr =
      rawBody ??
      (typeof body === 'string'
        ? body
        : body && typeof body === 'object'
          ? JSON.stringify(body)
          : '')
    if (!rawBody) {
      this.logger.warn(
        '[PAY-CB/wechat] req.rawBody 未启用，使用 JSON.stringify 兜底（main.ts 需开启 { rawBody: true }）'
      )
    }

    const result = await this.wechatProvider.verifyCallback(callbackHeaders, bodyStr)
    if (!result.valid || !result.resource) {
      this.logger.error(`[PAY-CB/wechat] 验签失败：${result.reason ?? 'unknown'}`)
      return { code: 'FAIL', message: result.reason ?? '验签失败' }
    }

    const { orderNo, transactionId, amount } = result.resource
    try {
      const r = await this.stateMachine.transit(orderNo, 'PaymentSucceed', {
        outTradeNo: transactionId,
        paidAt: Date.now(),
        rawResponse: result.resource.raw,
        extra: {
          source: 'wechat-callback-v3',
          payerOpenId: result.resource.payerOpenId,
          amountFen: amount
        }
      })
      this.logger.log(
        `[PAY-CB/wechat] ok payNo=${orderNo} tx=${transactionId} ${r.from}→${r.to} idempotent=${r.idempotent}`
      )
    } catch (err) {
      this.logger.error(
        `[PAY-CB/wechat] state transit 失败 payNo=${orderNo}：${(err as Error).message}`
      )
      return { code: 'FAIL', message: (err as Error).message }
    }

    return { code: 'SUCCESS', message: 'OK' }
  }

  /* ============================================================================
   * 2. 支付宝异步通知
   * ============================================================================ */

  /**
   * 支付宝异步通知
   * 入参：
   *   - body  form 解析后的 kv（NestJS 默认 urlencoded 中间件已处理）
   * 返回：
   *   - 'success' 字符串（支付宝规范，确认收到不再重试）
   *   - 'fail' 字符串（支付宝会按规则重试）
   */
  @Post('alipay')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '支付宝异步通知（真实链路）',
    description: 'AlipayProvider.verifyAsyncNotify → state machine 推进；返回 success / fail 字符串'
  })
  @ApiSwaggerResponse({ status: 200, description: 'success / fail' })
  async alipay(@Body() body: Record<string, unknown> | unknown): Promise<string> {
    if (!body || typeof body !== 'object') {
      this.logger.warn('[PAY-CB/alipay] body 不是对象（确认 main.ts 已启用 urlencoded 中间件）')
      return 'fail'
    }
    /* 把所有 value 强制转为 string（支付宝规范字段都是 string） */
    const params: Record<string, string> = {}
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v === undefined || v === null) continue
      params[k] = String(v)
    }

    const result = await this.alipayProvider.verifyAsyncNotify(params)
    if (!result.valid) {
      this.logger.error(`[PAY-CB/alipay] 验签失败：${result.reason ?? 'unknown'}`)
      return 'fail'
    }

    const orderNo = result.orderNo ?? ''
    if (!orderNo) {
      this.logger.error('[PAY-CB/alipay] out_trade_no 缺失')
      return 'fail'
    }

    /* 仅 TRADE_SUCCESS / TRADE_FINISHED 触发 PaymentSucceed；其余忽略（保持等待） */
    const ts = result.tradeStatus ?? ''
    if (ts !== 'TRADE_SUCCESS' && ts !== 'TRADE_FINISHED') {
      this.logger.log(`[PAY-CB/alipay] tradeStatus=${ts} 暂不推进 payNo=${orderNo}`)
      return 'success'
    }

    try {
      const r = await this.stateMachine.transit(orderNo, 'PaymentSucceed', {
        outTradeNo: result.tradeNo,
        paidAt: Date.now(),
        rawResponse: params as unknown as Record<string, unknown>,
        extra: {
          source: 'alipay-callback',
          tradeStatus: ts,
          totalAmount: result.totalAmount
        }
      })
      this.logger.log(
        `[PAY-CB/alipay] ok payNo=${orderNo} tradeNo=${result.tradeNo} ${r.from}→${r.to} idempotent=${r.idempotent}`
      )
    } catch (err) {
      this.logger.error(
        `[PAY-CB/alipay] state transit 失败 payNo=${orderNo}：${(err as Error).message}`
      )
      return 'fail'
    }

    return 'success'
  }
}

/**
 * Headers 容器读取（小写 key，兼容 string / string[] / undefined）
 * 参数：headers 容器；name header 名（小写）
 * 返回值：值字符串（默认 ''）
 */
function pickHeader(headers: Record<string, string | string[] | undefined>, name: string): string {
  const v = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()]
  if (Array.isArray(v)) return v[0] ?? ''
  return v ?? ''
}
