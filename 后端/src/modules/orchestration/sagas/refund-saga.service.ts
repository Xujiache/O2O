/**
 * @file refund-saga.service.ts
 * @stage P4/T4.49（Sprint 8）+ P9 Sprint 3 / W3.B.1（反向分账落地）
 * @desc RefundSucceed 事件 → 反向分账 + 通知用户
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 步骤：
 *   1. 反向分账：调用 SettlementService.reverseForOrder
 *      - 查 settlement_record WHERE order_no=? AND status=EXECUTED
 *      - 逐条反向：accountService.refund(targetOwner, settle_amount, REFUND_REVERSE)
 *      - UPDATE settlement_record.status=REVERSED 已撤销
 *      - 部分失败 best-effort：仅 logger.error，不阻断后续步骤（saga 仍标 ok）
 *   2. 通知用户"退款成功"
 *
 * 注意：
 *   - SettlementService 通过 OrchestrationModule.imports → FinanceModule.exports 注入
 *   - 全程 BigNumber，不使用 number 算金额
 *   - 库存恢复 / 券恢复 由 OrderCanceled Saga 处理（已支付的退款必先有 OrderCanceled）
 */

import { Injectable, Logger, Optional } from '@nestjs/common'
import { SettlementService } from '@/modules/finance/services/settlement.service'
import { MessageService } from '@/modules/message/message.service'
import { SagaRunnerService } from '../services/saga-runner.service'
import {
  type PaymentEventEnvelope,
  type SagaContext,
  type SagaRunResult,
  type SagaStep
} from '../types/orchestration.types'

/** RefundSaga 状态 */
interface RefundSagaState {
  reversed: number
  failed: number
  notified: boolean
}

@Injectable()
export class RefundSagaService {
  private readonly logger = new Logger(RefundSagaService.name)

  constructor(
    private readonly runner: SagaRunnerService,
    private readonly settlementService: SettlementService,
    @Optional() private readonly messageService?: MessageService
  ) {}

  /**
   * 入口：RefundSucceed 事件触发
   */
  async handleRefundSucceed(envelope: PaymentEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    if (payload.eventName !== 'RefundSucceed') {
      this.logger.warn(`[REFUND-SAGA] 事件 ${payload.eventName} 不应进入 RefundSaga`)
      return {
        sagaId: '',
        sagaName: 'NoOpSaga',
        executedSteps: [],
        failedStep: null,
        error: null,
        compensated: 0
      }
    }

    const steps: SagaStep<SagaContext<RefundSagaState>>[] = [
      {
        name: 'ReverseSettlement',
        run: async (ctx) => {
          /* P9 Sprint 3：调 SettlementService.reverseForOrder 真实反向分账
             部分失败仅落 logger.error，不抛错（reverseForOrder 内部已吞异常），
             saga 整体仍可向后推进通知步骤 */
          const result = await this.settlementService.reverseForOrder(
            payload.orderNo,
            payload.amount
          )
          ctx.state.reversed = result.reversed
          ctx.state.failed = result.failed
          this.logger.log(
            `[REFUND-SAGA] reverseForOrder order=${payload.orderNo} reversed=${result.reversed} failed=${result.failed}`
          )
        }
      },
      {
        name: 'NotifyRefundSucceed',
        run: async (ctx) => {
          if (!this.messageService || !payload.userId) return
          try {
            await this.messageService.send({
              code: 'REFUND_SUCCEED',
              targetType: 1,
              targetId: payload.userId,
              vars: {
                orderNo: payload.orderNo,
                amount: payload.amount,
                payNo: payload.payNo
              },
              category: 1,
              relatedType: payload.orderType,
              relatedNo: payload.orderNo
            })
            ctx.state.notified = true
          } catch (err) {
            this.logger.warn(
              `[REFUND-SAGA] notify REFUND_SUCCEED 失败 user=${payload.userId}：${err instanceof Error ? err.message : String(err)}`
            )
          }
        }
      }
    ]

    return this.runner.execute('RefundSucceedSaga', envelope, steps, {
      reversed: 0,
      failed: 0,
      notified: false
    })
  }
}
