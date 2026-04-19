/**
 * @file order-saga.service.ts
 * @stage P4/T4.49（Sprint 8）
 * @desc 订单生命周期 Saga：每个 OrderEvent 触发对应的副作用编排
 * @author 单 Agent V2.0（Subagent 7：Orchestration）
 *
 * 事件 → Saga 映射（DESIGN_P4 §十）：
 *   OrderCreated   → 通知用户/商户（best-effort，主流程已落库）
 *   OrderPaid      → ① InventoryService.commit（实际扣 DB 库存，外卖）
 *                    ② UserCouponService.use（核销冻结优惠券）
 *                    ③ DispatchService.dispatchOrder（外卖立即派单）
 *                    ④ MessageService 通知商户接单
 *   OrderAccepted  → 通知用户"商户已接单"
 *   OrderRejected  → 通知用户"商户拒单"，并记录 TODO（Payment 模块走自动退款）
 *   OrderReady     → DispatchService.dispatchOrder（外卖在出餐后才真正派骑手）
 *                    ↑ 由于 OrderPaid 已派单，此处 best-effort 重试派单（防御）
 *   OrderPicked    → 通知用户"骑手已取餐/件"
 *   OrderDelivered → 启动 5min 自动 Finished 兜底（本期仅日志，BullMQ delayed job 由 P9 接入）
 *   OrderFinished  → 触发 SettleSaga（settle-saga.service 单独编排）+ 邀请奖励（invite）
 *   OrderCanceled  → ① InventoryService.restore（库存回滚，best-effort）
 *                    ② UserCouponService.restore（券恢复）
 *                    ③ RefundService.createRefund（如果已支付）
 *
 * 实现简化（任务 §5.1）：
 *   - 核心 4 个 Saga 完整：OrderPaid / OrderFinished / OrderCanceled / RefundSucceed
 *   - 其他事件订阅打日志 + best-effort 通知，标 TODO P9
 *
 * 依赖注入说明：
 *   - 所有外部 service 用 @Optional()：避免 mock 模式 / 单测时强依赖；
 *     运行时缺失会跳过对应 step 并打 warn
 *   - 不调用 OrderStateMachine.transit（Saga 是事件后处理，状态已迁移）
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { OrderTakeoutStatusEnum, OrderTypeEnum } from '@/modules/order/types/order.types'
import type { OrderEventPayload } from '@/modules/order/events/order-events.constants'
import { OrderService } from '@/modules/order/services/order.service'
import {
  DispatchService,
  type DispatchService as DispatchServiceType
} from '@/modules/dispatch/services/dispatch.service'
import { OrderTypeForDispatch } from '@/modules/dispatch/types/dispatch.types'
import { InventoryService } from '@/modules/product/inventory.service'
import { UserCouponService } from '@/modules/marketing/services/user-coupon.service'
import { MessageService } from '@/modules/message/message.service'
import { RefundService } from '@/modules/payment/services/refund.service'
import {
  EventSourceEnum,
  type OrderEventEnvelope,
  type SagaContext,
  type SagaRunResult,
  type SagaStep
} from '../types/orchestration.types'
import { SagaRunnerService } from '../services/saga-runner.service'

/**
 * OrderSaga 共享状态
 *
 * 字段：
 *   - notifyTargets   各 step 累计的通知目标（debug / 单测断言）
 *   - inventoryRestored  库存是否已 restore（OrderCanceled 内）
 *   - couponRestored     券是否已 restore（OrderCanceled 内）
 *   - dispatchTriggered  是否触发派单（OrderPaid / OrderReady）
 */
interface OrderSagaState {
  notifyTargets: string[]
  inventoryRestored: boolean
  couponRestored: boolean
  dispatchTriggered: boolean
  refundCreated: boolean
}

@Injectable()
export class OrderSagaService {
  private readonly logger = new Logger(OrderSagaService.name)

  constructor(
    private readonly runner: SagaRunnerService,
    @Optional() private readonly orderService?: OrderService,
    @Optional()
    @Inject(DispatchService)
    private readonly dispatchService?: DispatchServiceType,
    @Optional() private readonly inventoryService?: InventoryService,
    @Optional() private readonly userCouponService?: UserCouponService,
    @Optional() private readonly messageService?: MessageService,
    @Optional() private readonly refundService?: RefundService
  ) {}

  /* ==========================================================================
   * 入口：handleOrderEvent —— 订单事件 → Saga 路由
   * ========================================================================== */

  /**
   * 订单事件统一入口（被 Consumer 调用）
   * 参数：envelope OrderEventEnvelope
   * 返回值：SagaRunResult（已落 DLQ；不向上抛业务异常）
   */
  async handleOrderEvent(envelope: OrderEventEnvelope): Promise<SagaRunResult> {
    const event = envelope.body.eventName
    switch (event) {
      case 'OrderCreated':
        return this.runOrderCreated(envelope)
      case 'OrderPaid':
        return this.runOrderPaid(envelope)
      case 'OrderAccepted':
        return this.runOrderAccepted(envelope)
      case 'OrderRejected':
        return this.runOrderRejected(envelope)
      case 'OrderReady':
        return this.runOrderReady(envelope)
      case 'OrderPicked':
        return this.runOrderPicked(envelope)
      case 'OrderDelivered':
        return this.runOrderDelivered(envelope)
      case 'OrderCanceled':
        return this.runOrderCanceled(envelope)
      default:
        this.logger.log(
          `[ORDER-SAGA] 事件 ${event} 暂无副作用（OrderFinished 由 SettleSaga 独立处理）`
        )
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
   * 1) OrderCreated（best-effort 通知）
   * ========================================================================== */

  /**
   * 下单成功后通知用户 + 商户（外卖才有 merchant）
   */
  private async runOrderCreated(envelope: OrderEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const steps: SagaStep<SagaContext<OrderSagaState>>[] = [
      {
        name: 'NotifyOrderCreated',
        run: async () => {
          await this.safeNotify({
            code: 'ORDER_CREATED',
            targetType: 1,
            targetId: await this.tryFindUserId(payload),
            relatedNo: payload.orderNo,
            relatedType: payload.orderType,
            vars: { orderNo: payload.orderNo }
          })
        }
      }
    ]
    return this.runner.execute('OrderCreatedSaga', envelope, steps, this.initialState())
  }

  /* ==========================================================================
   * 2) OrderPaid（核心 Saga：库存 commit + 优惠券核销 + 派单 + 通知）
   * ========================================================================== */

  /**
   * 订单已支付 → 库存 commit / 券核销 / 派单 / 通知商户
   *
   * 注：库存 commit 失败会触发反向补偿（restore）；派单失败仅 warn（BullMQ 重试由 dispatch 内部）
   */
  private async runOrderPaid(envelope: OrderEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const steps: SagaStep<SagaContext<OrderSagaState>>[] = []

    /* 仅外卖才走库存 + 券核销分支；跑腿无库存 */
    if (payload.orderType === OrderTypeEnum.TAKEOUT) {
      steps.push({
        name: 'CommitInventory',
        run: async (ctx) => {
          const items = this.extractInventoryItems(payload)
          if (items.length === 0 || !this.inventoryService) {
            this.logger.debug(
              `[ORDER-SAGA] CommitInventory 跳过 order=${payload.orderNo}（无明细 / inventory 未注入）`
            )
            return
          }
          await this.inventoryService.commit(items)
          ctx.state.inventoryRestored = false
        },
        compensate: async (ctx) => {
          const items = this.extractInventoryItems(payload)
          if (items.length === 0 || !this.inventoryService) return
          if (ctx.state.inventoryRestored) return
          await this.inventoryService.restore(items)
          ctx.state.inventoryRestored = true
        }
      })
    }

    steps.push({
      name: 'UseCoupon',
      run: async () => {
        const userCouponId = this.extractUserCouponId(payload)
        const discount = this.extractDiscountAmount(payload)
        if (!userCouponId || !this.userCouponService) {
          this.logger.debug(
            `[ORDER-SAGA] UseCoupon 跳过 order=${payload.orderNo}（无 userCouponId / 服务未注入）`
          )
          return
        }
        await this.userCouponService.use(
          userCouponId,
          payload.orderNo,
          payload.orderType,
          discount ?? '0.00'
        )
      }
    })

    /* 触发派单（外卖等 OrderReady 真派；本步骤仅记录意图，OrderReady 时再派） */
    if (payload.orderType === OrderTypeEnum.TAKEOUT) {
      steps.push({
        name: 'NotifyMerchantAccept',
        run: async () => {
          const merchantId = await this.tryFindMerchantId(payload)
          if (!merchantId) return
          await this.safeNotify({
            code: 'MERCHANT_NEW_ORDER',
            targetType: 2,
            targetId: merchantId,
            relatedNo: payload.orderNo,
            relatedType: payload.orderType,
            vars: { orderNo: payload.orderNo }
          })
        }
      })
    } else {
      /* 跑腿：支付完直接派单 */
      steps.push({
        name: 'DispatchErrand',
        run: async (ctx) => {
          if (!this.dispatchService) return
          await this.dispatchService.dispatchOrder(payload.orderNo, OrderTypeForDispatch.ERRAND, 0)
          ctx.state.dispatchTriggered = true
        }
      })
    }

    return this.runner.execute('OrderPaidSaga', envelope, steps, this.initialState())
  }

  /* ==========================================================================
   * 3) OrderAccepted（通知用户）
   * ========================================================================== */

  private async runOrderAccepted(envelope: OrderEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const steps: SagaStep<SagaContext<OrderSagaState>>[] = [
      {
        name: 'NotifyOrderAccepted',
        run: async () => {
          await this.safeNotify({
            code: 'ORDER_ACCEPTED',
            targetType: 1,
            targetId: await this.tryFindUserId(payload),
            relatedNo: payload.orderNo,
            relatedType: payload.orderType,
            vars: { orderNo: payload.orderNo }
          })
        }
      }
    ]
    return this.runner.execute('OrderAcceptedSaga', envelope, steps, this.initialState())
  }

  /* ==========================================================================
   * 4) OrderRejected（通知用户 + 等 Payment 自动退款）
   * ========================================================================== */

  private async runOrderRejected(envelope: OrderEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const steps: SagaStep<SagaContext<OrderSagaState>>[] = [
      {
        name: 'NotifyOrderRejected',
        run: async () => {
          await this.safeNotify({
            code: 'ORDER_REJECTED',
            targetType: 1,
            targetId: await this.tryFindUserId(payload),
            relatedNo: payload.orderNo,
            relatedType: payload.orderType,
            vars: { orderNo: payload.orderNo }
          })
        }
      }
    ]
    return this.runner.execute('OrderRejectedSaga', envelope, steps, this.initialState())
  }

  /* ==========================================================================
   * 5) OrderReady（外卖派骑手）
   * ========================================================================== */

  private async runOrderReady(envelope: OrderEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const steps: SagaStep<SagaContext<OrderSagaState>>[] = []

    if (payload.orderType === OrderTypeEnum.TAKEOUT) {
      steps.push({
        name: 'DispatchTakeoutOnReady',
        run: async (ctx) => {
          if (!this.dispatchService) return
          try {
            await this.dispatchService.dispatchOrder(
              payload.orderNo,
              OrderTypeForDispatch.TAKEOUT,
              0
            )
            ctx.state.dispatchTriggered = true
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            this.logger.warn(
              `[ORDER-SAGA] DispatchTakeoutOnReady 失败 order=${payload.orderNo}：${msg}（不阻断 saga）`
            )
          }
        }
      })
    }

    steps.push({
      name: 'NotifyOrderReady',
      run: async () => {
        await this.safeNotify({
          code: 'ORDER_READY',
          targetType: 1,
          targetId: await this.tryFindUserId(payload),
          relatedNo: payload.orderNo,
          relatedType: payload.orderType,
          vars: { orderNo: payload.orderNo }
        })
      }
    })

    return this.runner.execute('OrderReadySaga', envelope, steps, this.initialState())
  }

  /* ==========================================================================
   * 6) OrderPicked（通知用户）
   * ========================================================================== */

  private async runOrderPicked(envelope: OrderEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const steps: SagaStep<SagaContext<OrderSagaState>>[] = [
      {
        name: 'NotifyOrderPicked',
        run: async () => {
          await this.safeNotify({
            code: 'ORDER_PICKED',
            targetType: 1,
            targetId: await this.tryFindUserId(payload),
            relatedNo: payload.orderNo,
            relatedType: payload.orderType,
            vars: { orderNo: payload.orderNo }
          })
        }
      }
    ]
    return this.runner.execute('OrderPickedSaga', envelope, steps, this.initialState())
  }

  /* ==========================================================================
   * 7) OrderDelivered（5 分钟自动 Finished 由 P9 cron 实现，本期仅通知）
   * ========================================================================== */

  private async runOrderDelivered(envelope: OrderEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const steps: SagaStep<SagaContext<OrderSagaState>>[] = [
      {
        name: 'NotifyOrderDelivered',
        run: async () => {
          await this.safeNotify({
            code: 'ORDER_DELIVERED',
            targetType: 1,
            targetId: await this.tryFindUserId(payload),
            relatedNo: payload.orderNo,
            relatedType: payload.orderType,
            vars: { orderNo: payload.orderNo }
          })
        }
      }
    ]
    return this.runner.execute('OrderDeliveredSaga', envelope, steps, this.initialState())
  }

  /* ==========================================================================
   * 8) OrderCanceled（核心 Saga：库存恢复 + 券恢复 + 退款 + 通知）
   * ========================================================================== */

  /**
   * 订单取消 → 库存恢复 / 券恢复 / 已支付则触发退款 / 通知用户
   *
   * 行为：
   *   - 库存：reason=PayTimeout 时已 restore 过（OrderTimeoutScanner），跳过
   *   - 券：cancel 时如已冻结需 restore，未冻结则跳过（service 内部判断 status）
   *   - 退款：仅在 fromStatus >= 10（已支付）时才触发；reason 透传
   */
  private async runOrderCanceled(envelope: OrderEventEnvelope): Promise<SagaRunResult> {
    const payload = envelope.body
    const reason = (payload.extra?.reason as string) ?? 'OrderCanceled'
    const isPaid = (payload.fromStatus ?? 0) >= OrderTakeoutStatusEnum.PENDING_ACCEPT

    const steps: SagaStep<SagaContext<OrderSagaState>>[] = []

    /* 库存恢复（外卖；reason=PayTimeout 时也走，幂等） */
    if (payload.orderType === OrderTypeEnum.TAKEOUT) {
      steps.push({
        name: 'RestoreInventory',
        run: async (ctx) => {
          const items = this.extractInventoryItems(payload)
          if (items.length === 0 || !this.inventoryService) return
          /* PayTimeout / 取消都执行；Lua 脚本本身幂等（叠加值） */
          await this.inventoryService.restore(items)
          ctx.state.inventoryRestored = true
        }
      })
    }

    /* 券恢复（如果有 userCouponId） */
    steps.push({
      name: 'RestoreCoupon',
      run: async (ctx) => {
        const userCouponId = this.extractUserCouponId(payload)
        if (!userCouponId || !this.userCouponService) return
        try {
          await this.userCouponService.restore(userCouponId)
          ctx.state.couponRestored = true
        } catch (err) {
          /* 券非冻结 / 已使用 都会抛 BIZ_STATE_INVALID；非致命，仅 warn */
          const msg = err instanceof Error ? err.message : String(err)
          this.logger.warn(
            `[ORDER-SAGA] RestoreCoupon 跳过 order=${payload.orderNo} uc=${userCouponId}：${msg}`
          )
        }
      }
    })

    /* 退款（仅已支付订单；payNo 由 extra.payNo 透传，缺失走 Payment 模块自查） */
    if (isPaid) {
      steps.push({
        name: 'TriggerRefund',
        run: async (ctx) => {
          const payNo = payload.extra?.payNo as string | undefined
          const amount = (payload.extra?.amount as string | undefined) ?? '0.00'
          if (!payNo || !this.refundService) {
            this.logger.warn(
              `[ORDER-SAGA] TriggerRefund 跳过 order=${payload.orderNo}：payNo / refundService 缺失`
            )
            return
          }
          await this.refundService.createRefund({
            payNo,
            amount,
            reason: `订单取消：${reason}`
          })
          ctx.state.refundCreated = true
        }
      })
    }

    /* 通知用户 */
    steps.push({
      name: 'NotifyOrderCanceled',
      run: async () => {
        await this.safeNotify({
          code: 'ORDER_CANCELED',
          targetType: 1,
          targetId: await this.tryFindUserId(payload),
          relatedNo: payload.orderNo,
          relatedType: payload.orderType,
          vars: { orderNo: payload.orderNo, reason }
        })
      }
    })

    return this.runner.execute('OrderCanceledSaga', envelope, steps, this.initialState())
  }

  /* ==========================================================================
   * 内部工具
   * ========================================================================== */

  /** 初始化 OrderSagaState */
  private initialState(): OrderSagaState {
    return {
      notifyTargets: [],
      inventoryRestored: false,
      couponRestored: false,
      dispatchTriggered: false,
      refundCreated: false
    }
  }

  /**
   * 反查 userId（事件 extra 缺失时走 OrderService）
   */
  private async tryFindUserId(payload: OrderEventPayload): Promise<string> {
    const fromExtra = payload.extra?.userId as string | undefined
    if (fromExtra) return fromExtra
    if (!this.orderService) return ''
    try {
      const order = await this.orderService.findCoreByOrderNo(payload.orderNo, payload.orderType)
      return order.userId
    } catch (err) {
      this.logger.warn(
        `[ORDER-SAGA] tryFindUserId 失败 order=${payload.orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return ''
    }
  }

  /**
   * 反查 merchantId（仅外卖；缺失时走 OrderService）
   */
  private async tryFindMerchantId(payload: OrderEventPayload): Promise<string | null> {
    const fromExtra = payload.extra?.merchantId as string | undefined
    if (fromExtra) return fromExtra
    if (!this.orderService) return null
    try {
      const order = await this.orderService.findCoreByOrderNo(payload.orderNo, payload.orderType)
      return order.merchantId
    } catch (err) {
      this.logger.warn(
        `[ORDER-SAGA] tryFindMerchantId 失败 order=${payload.orderNo}：${err instanceof Error ? err.message : String(err)}`
      )
      return null
    }
  }

  /**
   * 从事件 extra.items 解析库存项
   * 期望格式：extra.items = [{ skuId: '...', qty: 1 }, ...]
   */
  private extractInventoryItems(payload: OrderEventPayload): Array<{ skuId: string; qty: number }> {
    const raw = payload.extra?.items as Array<{ skuId?: string; qty?: number }> | undefined
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (it): it is { skuId: string; qty: number } =>
          typeof it.skuId === 'string' && typeof it.qty === 'number' && it.qty > 0
      )
      .map((it) => ({ skuId: it.skuId, qty: it.qty }))
  }

  /** 从事件 extra 解析 userCouponId */
  private extractUserCouponId(payload: OrderEventPayload): string | null {
    const v = payload.extra?.userCouponId
    return typeof v === 'string' && v.length > 0 ? v : null
  }

  /** 从事件 extra 解析 discountAmount */
  private extractDiscountAmount(payload: OrderEventPayload): string | null {
    const v = payload.extra?.discountAmount
    return typeof v === 'string' && v.length > 0 ? v : null
  }

  /**
   * 安全发送站内信（messageService 缺失或抛错都仅 warn）
   */
  private async safeNotify(input: {
    code: string
    targetType: 1 | 2 | 3 | 4
    targetId: string
    relatedNo: string
    relatedType: number | null
    vars?: Record<string, string | number>
  }): Promise<void> {
    if (!this.messageService) return
    if (!input.targetId) return
    try {
      await this.messageService.send({
        code: input.code,
        targetType: input.targetType,
        targetId: input.targetId,
        vars: input.vars ?? {},
        category: 1,
        relatedType: input.relatedType,
        relatedNo: input.relatedNo
      })
    } catch (err) {
      this.logger.warn(
        `[ORDER-SAGA] notify ${input.code} 失败 target=${input.targetId}：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 统一来源校验（debug 用，不抛错）
   */
  assertOrderEnvelope(envelope: OrderEventEnvelope): void {
    if (envelope.source !== EventSourceEnum.ORDER) {
      this.logger.warn(
        `[ORDER-SAGA] envelope.source=${envelope.source} ≠ 'order'，仍按 order 路由处理`
      )
    }
  }
}
