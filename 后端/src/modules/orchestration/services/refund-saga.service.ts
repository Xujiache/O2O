/**
 * @file refund-saga.service.ts（services/）
 * @stage P9 Sprint 3 / W3.B.1
 * @desc RefundReverseSaga：finance-module-side 入口；订阅 RefundSucceeded 事件 →
 *       SagaRunner.execute('RefundReverseSaga', envelope, steps)
 * @author 单 Agent V2.0（Sprint 3 Agent B）
 *
 * 设计动机：
 *   - 现有 orchestration/sagas/refund-saga.service.ts 仍由 OrchestrationModule 装载，
 *     由 PaymentEventsConsumer 订阅 AMQP 事件后路由到 handleRefundSucceed；
 *   - 本 services/refund-saga.service.ts 由 FinanceModule 装载，作为
 *     "RefundReverseSaga" 的 finance 域入口，可被同步代码路径（如本地集成测 / 单测）
 *     直接调用 runReverseSaga(envelope) 而无需经过 AMQP；
 *   - 二者复用 SagaRunnerService + SettlementService，业务等价，仅触发链路不同。
 *
 * 步骤：
 *   1. ReverseSettlement       SettlementService.reverseForOrder
 *   2. NotifyRefundSucceeded   MessageService.send（best-effort，缺 service / userId 跳过）
 *
 * 注意：
 *   - 类名 `RefundReverseSagaService` 区别于 orchestration/sagas 内的 `RefundSagaService`
 *     避免 NestJS DI 双注册冲突（两者类型 token 不同）
 *   - 全程 BigNumber，不使用 parseFloat / Number
 */

import { Injectable, Logger, Optional } from '@nestjs/common'
import { MessageService } from '@/modules/message/message.service'
import { SagaRunnerService } from './saga-runner.service'
import {
  type PaymentEventEnvelope,
  type SagaContext,
  type SagaRunResult,
  type SagaStep
} from '../types/orchestration.types'
import { SettlementService } from '@/modules/finance/services/settlement.service'

/** RefundReverseSaga 内部状态 */
interface RefundReverseSagaState {
  /** SettlementService.reverseForOrder 反向成功条数 */
  reversed: number
  /** 失败条数（部分失败不阻断后续步骤） */
  failed: number
  /** 用户通知是否已发送 */
  notified: boolean
}

/**
 * RefundReverseSagaService：finance 域 RefundSucceeded → 反向分账 + 通知 saga
 */
@Injectable()
export class RefundReverseSagaService {
  private readonly logger = new Logger(RefundReverseSagaService.name)

  constructor(
    private readonly runner: SagaRunnerService,
    private readonly settlementService: SettlementService,
    @Optional() private readonly messageService?: MessageService
  ) {}

  /**
   * 运行反向分账 saga
   *
   * 入参：envelope PaymentEventEnvelope（eventName='RefundSucceeded' 或 'RefundSucceed'）
   * 返回值：SagaRunResult（含 sagaId / executedSteps / failedStep）
   *
   * 行为：
   *   - 仅在 eventName 命中时触发；其他事件仅 warn 返回 NoOpSaga
   *   - 调 SagaRunnerService.execute → 失败步骤自动落 DLQ + saga_state
   */
  async runReverseSaga(envelope: PaymentEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    /* 兼容两种事件命名：当前 publisher 类型为 'RefundSucceed'；'RefundSucceeded' 留兼容位 */
    const evName = payload.eventName as string
    if (evName !== 'RefundSucceed' && evName !== 'RefundSucceeded') {
      this.logger.warn(`[REFUND-REVERSE-SAGA] 非预期事件 ${evName}，跳过`)
      return {
        sagaId: '',
        sagaName: 'NoOpSaga',
        executedSteps: [],
        failedStep: null,
        error: null,
        compensated: 0
      }
    }

    const steps: SagaStep<SagaContext<RefundReverseSagaState>>[] = [
      {
        name: 'ReverseSettlement',
        run: async (ctx) => {
          const result = await this.settlementService.reverseForOrder(
            payload.orderNo,
            payload.amount
          )
          ctx.state.reversed = result.reversed
          ctx.state.failed = result.failed
          this.logger.log(
            `[REFUND-REVERSE-SAGA] reverseForOrder order=${payload.orderNo} reversed=${result.reversed} failed=${result.failed}`
          )
        }
      },
      {
        name: 'NotifyRefundSucceeded',
        run: async (ctx) => {
          if (!this.messageService || !payload.userId) {
            return
          }
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
            const msg = err instanceof Error ? err.message : String(err)
            this.logger.warn(
              `[REFUND-REVERSE-SAGA] 通知 REFUND_SUCCEED 失败 user=${payload.userId}：${msg}`
            )
          }
        }
      }
    ]

    return this.runner.execute('RefundReverseSaga', envelope, steps, {
      reversed: 0,
      failed: 0,
      notified: false
    })
  }
}
