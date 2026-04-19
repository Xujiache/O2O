/**
 * @file balance.adapter.ts
 * @stage P4/T4.26（Sprint 4）
 * @desc 余额"伪适配器"：满足 IPaymentAdapter 接口，实际逻辑在 BalanceService 内
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 设计说明：
 *   - 余额支付不经过第三方，本 Adapter 只承担"协议适配"角色：
 *       createPay   返回 alreadyPaid=true，PaymentService 收到后立刻转 SUCCESS
 *                   并调 BalanceService.payByBalance(orderNo,userId,amount) 走账户事务
 *       refund      余额退款入参依据：orderNo + amount + reason；本 Adapter 不真正写账户，
 *                   而是返回 status='SUCCESS'，后续由 RefundService 在余额场景下事务里
 *                   写 account_flow + balance += amount + payment_record.status=5
 *       verifyNotify 余额无回调，恒返回 ok=false（防止误用此 adapter 处理回调）
 *       queryStatus 直接 SUCCESS（同步即成功）
 */

import { Injectable, Logger } from '@nestjs/common'
import {
  type CreatePayRequest,
  type CreatePayResult,
  type IPaymentAdapter,
  type NotifyRawInput,
  type RefundRequest,
  type RefundResult,
  type VerifyNotifyResult
} from './payment-adapter.interface'

@Injectable()
export class BalanceAdapter implements IPaymentAdapter {
  private readonly logger = new Logger(BalanceAdapter.name)

  readonly channelKey = 'balance'

  /** 余额支付永远 mockMode=false（无第三方依赖） */
  readonly mockMode = false

  /* ============================================================================
   * 1. 创建支付（实际余额扣减由 BalanceService 在事务中完成）
   * ============================================================================ */

  async createPay(req: CreatePayRequest): Promise<CreatePayResult> {
    this.logger.log(
      `[Balance] createPay payNo=${req.payNo} userId=${req.userId} amount=${req.amount}`
    )
    return Promise.resolve({
      prepayId: req.payNo,
      prepayParams: { method: 'balance', payNo: req.payNo, amount: req.amount },
      rawResponse: { synchronous: true, channel: 'balance' },
      alreadyPaid: true
    })
  }

  /* ============================================================================
   * 2. 查询状态（恒 SUCCESS，由 PaymentRecord 决定真实状态）
   * ============================================================================ */

  async queryStatus(
    payNo: string
  ): Promise<{ tradeStatus: 'SUCCESS' | 'FAIL' | 'CLOSED' | 'NOTPAY'; outTradeNo?: string }> {
    this.logger.debug(`[Balance] queryStatus payNo=${payNo} → SUCCESS（同步）`)
    return Promise.resolve({ tradeStatus: 'SUCCESS', outTradeNo: payNo })
  }

  /* ============================================================================
   * 3. 退款（实际加回余额由 RefundService 在事务中完成）
   * ============================================================================ */

  async refund(req: RefundRequest): Promise<RefundResult> {
    this.logger.log(
      `[Balance] refund refundNo=${req.refundNo} payNo=${req.payNo} amount=${req.refundAmount}`
    )
    return Promise.resolve({
      outRefundNo: req.refundNo,
      status: 'SUCCESS',
      rawResponse: { synchronous: true, channel: 'balance' }
    })
  }

  /* ============================================================================
   * 4. 回调验签（余额无第三方回调，恒拒）
   * ============================================================================ */

  verifyNotify(_input: NotifyRawInput): VerifyNotifyResult {
    return { ok: false, reason: '余额支付无第三方回调' }
  }
}
