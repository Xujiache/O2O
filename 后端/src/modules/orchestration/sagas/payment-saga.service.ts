/**
 * @file payment-saga.service.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc 支付事件 Saga：PaymentSucceed / PaymentFailed / PaymentClosed → 触发订单状态变迁
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 事件 → Saga 映射：
 *   PaymentSucceed → ① OrderStateMachine.transit(order, 'OrderPaid')（状态 0→10）
 *                    ② 后续库存 commit / 券核销 / 派单 由 OrderPaid 事件触发的 OrderSaga 处理
 *   PaymentFailed  → 通知用户（不调状态机；OrderTakeoutService.cancelByPaymentFailure 由调用方触发）
 *   PaymentClosed  → 通知用户（同上；本期与 OrderCanceled 等价）
 *   RefundSucceed  → 不在本 Saga 处理（由 RefundSaga 单独编排）
 *
 * 简化（任务 §5.1）：
 *   - 仅落地 PaymentSucceed 核心 Saga；PaymentFailed / PaymentClosed 仅通知 + 记日志
 *   - 跑腿 / 外卖 通用：transit 后续动作由 OrderPaid 事件触发
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { OrderStateMachine } from '@/modules/order/state-machine/order-state-machine'
import { OrderOpTypeEnum, type OrderType } from '@/modules/order/types/order.types'
import { MessageService } from '@/modules/message/message.service'
import {
  type PaymentEventEnvelope,
  type SagaContext,
  type SagaRunResult,
  type SagaStep
} from '../types/orchestration.types'
import { SagaRunnerService } from '../services/saga-runner.service'

/** PaymentSaga 共享状态 */
interface PaymentSagaState {
  orderTransitioned: boolean
}

@Injectable()
export class PaymentSagaService {
  private readonly logger = new Logger(PaymentSagaService.name)

  constructor(
    private readonly runner: SagaRunnerService,
    @Optional()
    @Inject(OrderStateMachine)
    private readonly stateMachine?: OrderStateMachine,
    @Optional() private readonly messageService?: MessageService
  ) {}

  /**
   * 入口：支付事件路由
   */
  async handlePaymentEvent(envelope: PaymentEventEnvelope): Promise<SagaRunResult> {
    const event = envelope.body.eventName
    switch (event) {
      case 'PaymentSucceed':
        return this.runPaymentSucceed(envelope)
      case 'PaymentFailed':
        return this.runPaymentFailed(envelope)
      case 'PaymentClosed':
        return this.runPaymentClosed(envelope)
      case 'RefundSucceed':
      case 'RefundCreated':
      case 'RefundFailed':
      case 'PaymentCreated':
        this.logger.debug(`[PAY-SAGA] 事件 ${event} 不由本 Saga 处理（RefundSucceed → RefundSaga）`)
        return {
          sagaId: '',
          sagaName: 'NoOpSaga',
          executedSteps: [],
          failedStep: null,
          error: null,
          compensated: 0
        }
      default:
        this.logger.warn(`[PAY-SAGA] 未知事件 ${event}，跳过`)
        return {
          sagaId: '',
          sagaName: 'NoOpSaga',
          executedSteps: [],
          failedStep: null,
          error: null,
          compensated: 0
        }
    }
  }

  /* ==========================================================================
   * 1) PaymentSucceed —— 触发 OrderPaid 状态变迁
   * ========================================================================== */

  /**
   * 支付成功 → 把订单 0 → 10（外卖）/ 0 → 10（跑腿）
   *
   * 注：transit 内部会发 OrderPaid 事件，OrderSaga 接力做库存 commit / 券核销 / 派单
   */
  private async runPaymentSucceed(envelope: PaymentEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const steps: SagaStep<SagaContext<PaymentSagaState>>[] = [
      {
        name: 'TransitOrderToPaid',
        run: async (ctx) => {
          if (!this.stateMachine) {
            this.logger.warn(
              `[PAY-SAGA] stateMachine 未注入，跳过 transit order=${payload.orderNo}`
            )
            return
          }
          const orderType = payload.orderType as OrderType
          await this.stateMachine.transit(payload.orderNo, orderType, 'OrderPaid', {
            opType: OrderOpTypeEnum.SYSTEM,
            opId: null,
            remark: `支付成功 payNo=${payload.payNo}`,
            additionalFields: {
              payStatus: 2,
              payAt: new Date(payload.occurredAt)
            },
            eventPayloadExtra: {
              payNo: payload.payNo,
              amount: payload.amount,
              payMethod: payload.payMethod
            }
          })
          ctx.state.orderTransitioned = true
        }
      }
    ]
    return this.runner.execute('PaymentSucceedSaga', envelope, steps, {
      orderTransitioned: false
    })
  }

  /* ==========================================================================
   * 2) PaymentFailed —— 通知用户（不调状态机）
   * ========================================================================== */

  private async runPaymentFailed(envelope: PaymentEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const steps: SagaStep<SagaContext<PaymentSagaState>>[] = [
      {
        name: 'NotifyPaymentFailed',
        run: async () => {
          await this.safeNotify({
            code: 'PAYMENT_FAILED',
            targetId: payload.userId,
            relatedNo: payload.orderNo,
            relatedType: payload.orderType,
            vars: { orderNo: payload.orderNo, payNo: payload.payNo }
          })
        }
      }
    ]
    return this.runner.execute('PaymentFailedSaga', envelope, steps, {
      orderTransitioned: false
    })
  }

  /* ==========================================================================
   * 3) PaymentClosed —— 通知用户
   * ========================================================================== */

  private async runPaymentClosed(envelope: PaymentEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const steps: SagaStep<SagaContext<PaymentSagaState>>[] = [
      {
        name: 'NotifyPaymentClosed',
        run: async () => {
          await this.safeNotify({
            code: 'PAYMENT_CLOSED',
            targetId: payload.userId,
            relatedNo: payload.orderNo,
            relatedType: payload.orderType,
            vars: { orderNo: payload.orderNo, payNo: payload.payNo }
          })
        }
      }
    ]
    return this.runner.execute('PaymentClosedSaga', envelope, steps, {
      orderTransitioned: false
    })
  }

  /**
   * 安全通知封装
   */
  private async safeNotify(input: {
    code: string
    targetId: string
    relatedNo: string
    relatedType: number
    vars: Record<string, string | number>
  }): Promise<void> {
    if (!this.messageService || !input.targetId) return
    try {
      await this.messageService.send({
        code: input.code,
        targetType: 1,
        targetId: input.targetId,
        vars: input.vars,
        category: 1,
        relatedType: input.relatedType,
        relatedNo: input.relatedNo
      })
    } catch (err) {
      this.logger.warn(
        `[PAY-SAGA] notify ${input.code} 失败 target=${input.targetId}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}
