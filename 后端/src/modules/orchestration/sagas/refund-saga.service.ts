/**
 * @file refund-saga.service.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc RefundSucceed 事件 → 反向分账（如已分账）+ 通知用户
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 步骤：
 *   1. 反向分账：本期未实现 SettlementService.reverseForOrder，先查现有 settlement_record
 *      已 EXECUTED 的部分仅打 warn 标 TODO（P9 接入完整反向链路）
 *   2. 通知用户"退款成功"
 *
 * 简化（任务 §5.1）：
 *   - 反向分账实现复杂（需 AccountService.spend + 重写 settlement_record.status=3 已撤销 + 流水）
 *     本期先打 TODO，仅记录撤销意图；P9 完善
 *   - 库存恢复 / 券恢复 由 OrderCanceled Saga 处理（已支付的退款必先有 OrderCanceled）
 */

import { Injectable, Logger, Optional } from '@nestjs/common'
import { MessageService } from '@/modules/message/message.service'
import {
  type PaymentEventEnvelope,
  type SagaContext,
  type SagaRunResult,
  type SagaStep
} from '../types/orchestration.types'
import { SagaRunnerService } from '../services/saga-runner.service'

/** RefundSaga 状态 */
interface RefundSagaState {
  reverseSettlementMarked: boolean
  notified: boolean
}

@Injectable()
export class RefundSagaService {
  private readonly logger = new Logger(RefundSagaService.name)

  constructor(
    private readonly runner: SagaRunnerService,
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
        name: 'MarkReverseSettlement',
        run: async (ctx) => {
          /* TODO P9：完整反向分账链路：
             - 查 settlement_record WHERE order_no=? AND status=1 EXECUTED
             - 对每条 record：accountService.spend(targetOwner, settle_amount, REFUND_REVERSE)
             - UPDATE settlement_record SET status=3 已撤销 + reverse_flow_no
             本期仅打 warn 标记 TODO，确保流程 saga 可正常完成 */
          this.logger.warn(
            `[REFUND-SAGA] 反向分账 TODO P9 order=${payload.orderNo} payNo=${payload.payNo} amount=${payload.amount}`
          )
          ctx.state.reverseSettlementMarked = true
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
      reverseSettlementMarked: false,
      notified: false
    })
  }
}
