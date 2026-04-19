/**
 * @file settle-saga.service.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc OrderFinished 事件 → 即时分账 + 邀请奖励 + 评价提醒
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 步骤：
 *   1. SettlementService.runForOrder（即时分账，T+1 兼容；可与 settlement-cron 并存幂等）
 *   2. InviteRelationService.completeReward（被邀请人首单完成 → 邀请人发积分）
 *   3. MessageService 推送评价提醒
 *
 * 简化（任务 §5.1）：
 *   - 本期"立即分账"（不等 T+1）；与 settlement-cron 共存（service 内查重幂等）
 *   - 分账失败 仅 warn 不补偿；DLQ 由 SagaRunner 落
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { OrderService } from '@/modules/order/services/order.service'
import { OrderTypeEnum, type OrderType } from '@/modules/order/types/order.types'
import {
  SettlementService,
  type SettlementInput
} from '@/modules/finance/services/settlement.service'
import { InviteRelationService } from '@/modules/marketing/services/invite-relation.service'
import { MessageService } from '@/modules/message/message.service'
import {
  type OrderEventEnvelope,
  type SagaContext,
  type SagaRunResult,
  type SagaStep
} from '../types/orchestration.types'
import { SagaRunnerService } from '../services/saga-runner.service'

/** SettleSaga 状态 */
interface SettleSagaState {
  settlementCreated: number
  inviteRewarded: boolean
}

@Injectable()
export class SettleSagaService {
  private readonly logger = new Logger(SettleSagaService.name)

  constructor(
    private readonly runner: SagaRunnerService,
    @Optional() private readonly orderService?: OrderService,
    @Optional()
    @Inject(SettlementService)
    private readonly settlementService?: SettlementService,
    @Optional() private readonly inviteService?: InviteRelationService,
    @Optional() private readonly messageService?: MessageService
  ) {}

  /**
   * 入口：OrderFinished 事件触发
   */
  async handleOrderFinished(envelope: OrderEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    if (payload.eventName !== 'OrderFinished') {
      this.logger.warn(`[SETTLE-SAGA] 事件 ${payload.eventName} 不应进入 SettleSaga`)
      return {
        sagaId: '',
        sagaName: 'NoOpSaga',
        executedSteps: [],
        failedStep: null,
        error: null,
        compensated: 0
      }
    }

    const steps: SagaStep<SagaContext<SettleSagaState>>[] = [
      {
        name: 'RunSettlement',
        run: async (ctx) => {
          if (!this.settlementService) {
            this.logger.warn('[SETTLE-SAGA] settlementService 未注入，跳过')
            return
          }
          const input = await this.buildSettlementInput(
            payload.orderNo,
            payload.orderType as OrderType
          )
          if (!input) {
            this.logger.warn(
              `[SETTLE-SAGA] 无法构造 SettlementInput order=${payload.orderNo}（订单未找到）`
            )
            return
          }
          const result = await this.settlementService.runForOrder(input)
          ctx.state.settlementCreated = result.created
          this.logger.log(
            `[SETTLE-SAGA] 分账完成 order=${payload.orderNo} created=${result.created} executed=${result.executed} failed=${result.failed} skipped=${result.skipped}`
          )
        }
      },
      {
        name: 'CompleteInviteReward',
        run: async (ctx) => {
          if (!this.inviteService) return
          const userId =
            (payload.extra?.userId as string | undefined) ??
            (await this.tryFindUserId(payload.orderNo, payload.orderType as OrderType))
          if (!userId) {
            this.logger.warn(
              `[SETTLE-SAGA] CompleteInviteReward 跳过 order=${payload.orderNo}：userId 缺失`
            )
            return
          }
          await this.inviteService.completeReward(userId, payload.orderNo)
          ctx.state.inviteRewarded = true
        }
      },
      {
        name: 'NotifyReviewReminder',
        run: async () => {
          if (!this.messageService) return
          const userId =
            (payload.extra?.userId as string | undefined) ??
            (await this.tryFindUserId(payload.orderNo, payload.orderType as OrderType))
          if (!userId) return
          try {
            await this.messageService.send({
              code: 'ORDER_REVIEW_REMINDER',
              targetType: 1,
              targetId: userId,
              vars: { orderNo: payload.orderNo },
              category: 1,
              relatedType: payload.orderType,
              relatedNo: payload.orderNo
            })
          } catch (err) {
            this.logger.warn(
              `[SETTLE-SAGA] notify reminder 失败 order=${payload.orderNo}：${err instanceof Error ? err.message : String(err)}`
            )
          }
        }
      }
    ]
    return this.runner.execute('OrderFinishedSaga', envelope, steps, {
      settlementCreated: 0,
      inviteRewarded: false
    })
  }

  /**
   * 从 order_takeout / order_errand 拼出 SettlementInput
   */
  private async buildSettlementInput(
    orderNo: string,
    orderType: OrderType
  ): Promise<SettlementInput | null> {
    if (!this.orderService) return null
    try {
      const order = await this.orderService.findCoreByOrderNo(orderNo, orderType)
      return {
        orderNo: order.orderNo,
        orderType: order.orderType,
        merchantId: order.merchantId,
        riderId: order.riderId,
        shopId: order.shopId,
        cityCode: null,
        payAmount: order.payAmount,
        finishedAt: new Date()
      }
    } catch (err) {
      this.logger.warn(
        `[SETTLE-SAGA] buildSettlementInput 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return null
    }
  }

  /**
   * 反查 userId
   */
  private async tryFindUserId(orderNo: string, orderType: OrderType): Promise<string> {
    if (!this.orderService) return ''
    try {
      const order = await this.orderService.findCoreByOrderNo(orderNo, orderType)
      return order.userId
    } catch (err) {
      this.logger.warn(
        `[SETTLE-SAGA] tryFindUserId 失败 order=${orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return ''
    }
  }

  /**
   * orderType 是否需要分账（外卖 / 跑腿都需要；保留 hook 给后续扩展）
   */
  needsSettlement(orderType: OrderType): boolean {
    return orderType === OrderTypeEnum.TAKEOUT || orderType === OrderTypeEnum.ERRAND
  }
}
