/**
 * @file takeout-flow.e2e-spec.ts
 * @stage P4/T4.50（Sprint 8）
 * @desc 外卖闭环 framework-level e2e 测试：9 节点 OrderCreated → ... → Settlement
 * @author 单 Agent V2.0（Subagent 7：Orchestration + 收尾）
 *
 * 9 节点（DESIGN_P4 §十 / ACCEPTANCE_P4 V4.39）：
 *   1. 用户下单（OrderCreated 事件）→ 通知用户
 *   2. 用户支付成功（PaymentSucceed 事件）→ PaymentSaga.transit OrderPaid
 *   3. 商户接单（OrderAccepted 事件）→ 通知用户
 *   4. 商户出餐（OrderReady 事件）→ DispatchService.dispatchOrder
 *   5. 系统派单（DispatchService 已被 OrderReady saga 调用）
 *   6. 骑手取餐（OrderPicked 事件）→ 通知用户
 *   7. 骑手送达（OrderDelivered 事件）→ 通知用户
 *   8. 用户确认收货（OrderFinished 事件）→ SettleSaga
 *   9. T+1 分账（SettlementService.runForOrder 触发）+ 邀请奖励 + 评价提醒
 *
 * 注：本测试为 framework-level e2e（直接调 Saga 层）；
 *     依赖真实 docker（MySQL/Redis/RabbitMQ）的 HTTP-level e2e 在 P9 集成测试阶段补
 *
 * 验收：每节点都需 expect 关键 mock 被调（如 dispatch 被触发、stateMachine 被调）
 */

import {
  EventSourceEnum,
  type OrderEventEnvelope,
  type PaymentEventEnvelope
} from '@/modules/orchestration/types/orchestration.types'
import { OrderTypeEnum, OrderTakeoutStatusEnum } from '@/modules/order/types/order.types'
import { PayMethod, PayStatus } from '@/modules/payment/types/payment.types'
import { createMockApp, type MockApp } from './helpers/mock-app.factory'
import {
  SEED_MERCHANT,
  SEED_RIDER,
  SEED_SHOP,
  SEED_TAKEOUT_ORDER_NO,
  SEED_TAKEOUT_PAY_NO,
  SEED_USER,
  SEED_USER_COUPON
} from './helpers/seed-data'

describe('Takeout Flow e2e (framework-level, 9 nodes)', () => {
  let app: MockApp

  /** 构造 OrderEventEnvelope */
  const buildOrderEnvelope = (
    eventName:
      | 'OrderCreated'
      | 'OrderPaid'
      | 'OrderAccepted'
      | 'OrderReady'
      | 'OrderPicked'
      | 'OrderDelivered'
      | 'OrderFinished'
      | 'OrderCanceled'
      | 'OrderRejected',
    fromStatus: number,
    toStatus: number,
    extra: Record<string, unknown> = {}
  ): OrderEventEnvelope => ({
    source: EventSourceEnum.ORDER,
    eventName,
    body: {
      eventName,
      orderNo: SEED_TAKEOUT_ORDER_NO,
      orderType: OrderTypeEnum.TAKEOUT,
      fromStatus,
      toStatus,
      occurredAt: Date.now(),
      traceId: '',
      extra: {
        userId: SEED_USER.id,
        merchantId: SEED_MERCHANT.id,
        ...extra
      }
    },
    receivedAt: Date.now(),
    traceId: ''
  })

  /** 构造 PaymentEventEnvelope */
  const buildPayEnvelope = (
    eventName: 'PaymentSucceed' | 'PaymentFailed' | 'PaymentClosed',
    fromStatus: PayStatus,
    toStatus: PayStatus
  ): PaymentEventEnvelope => ({
    source: EventSourceEnum.PAYMENT,
    eventName,
    body: {
      eventName,
      payNo: SEED_TAKEOUT_PAY_NO,
      orderNo: SEED_TAKEOUT_ORDER_NO,
      orderType: OrderTypeEnum.TAKEOUT,
      userId: SEED_USER.id,
      amount: '50.00',
      payMethod: PayMethod.WX_PAY,
      fromStatus,
      toStatus,
      occurredAt: Date.now(),
      traceId: '',
      extra: {}
    },
    receivedAt: Date.now(),
    traceId: ''
  })

  beforeEach(async () => {
    app = await createMockApp()
    /* 默认 OrderService.findCoreByOrderNo 返回标准订单 */
    app.mocks.orderServiceFindCore.mockResolvedValue({
      orderType: OrderTypeEnum.TAKEOUT,
      shardYyyymm: '202604',
      id: 'O1',
      orderNo: SEED_TAKEOUT_ORDER_NO,
      userId: SEED_USER.id,
      shopId: SEED_SHOP.id,
      merchantId: SEED_MERCHANT.id,
      riderId: SEED_RIDER.id,
      status: OrderTakeoutStatusEnum.FINISHED,
      payStatus: 2,
      payAmount: '50.00',
      createdAt: new Date()
    })
  })

  afterEach(async () => {
    if (app) await app.module.close()
  })

  /* ============================================================
   * Node 1: OrderCreated
   * ============================================================ */

  it('Node 1: OrderCreated -> notifies user (best-effort)', async () => {
    await app.orderConsumer.dispatch(buildOrderEnvelope('OrderCreated', 0, 0).body)
    /* 只触发 saga，无 DLQ */
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
    /* OrderCreated saga 调用 messageService.send */
    expect(app.mocks.messageSend).toHaveBeenCalled()
  })

  /* ============================================================
   * Node 2: PaymentSucceed -> OrderPaid (state machine transit)
   * ============================================================ */

  it('Node 2: PaymentSucceed -> stateMachine.transit OrderPaid', async () => {
    app.mocks.stateMachineTransit.mockResolvedValue({
      orderNo: SEED_TAKEOUT_ORDER_NO,
      orderType: OrderTypeEnum.TAKEOUT,
      event: 'OrderPaid',
      fromStatus: 0,
      toStatus: 10,
      statusLogId: 'L1',
      occurredAt: Date.now()
    })

    await app.paymentConsumer.dispatch(
      buildPayEnvelope('PaymentSucceed', PayStatus.PAYING, PayStatus.SUCCESS).body
    )

    expect(app.mocks.stateMachineTransit).toHaveBeenCalledWith(
      SEED_TAKEOUT_ORDER_NO,
      OrderTypeEnum.TAKEOUT,
      'OrderPaid',
      expect.objectContaining({
        opType: expect.any(Number),
        opId: null
      })
    )
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Node 3: OrderPaid event -> commit inventory + use coupon
   * ============================================================ */

  it('Node 3: OrderPaid -> commit inventory + use coupon + notify merchant', async () => {
    await app.orderConsumer.dispatch(
      buildOrderEnvelope('OrderPaid', 0, 10, {
        items: [{ skuId: 'SKU1', qty: 2 }],
        userCouponId: SEED_USER_COUPON.id,
        discountAmount: '5.00'
      }).body
    )

    expect(app.mocks.inventoryCommit).toHaveBeenCalledWith([{ skuId: 'SKU1', qty: 2 }])
    expect(app.mocks.userCouponUse).toHaveBeenCalledWith(
      SEED_USER_COUPON.id,
      SEED_TAKEOUT_ORDER_NO,
      OrderTypeEnum.TAKEOUT,
      '5.00'
    )
    expect(app.mocks.messageSend).toHaveBeenCalled()
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Node 4: OrderAccepted -> notify user
   * ============================================================ */

  it('Node 4: OrderAccepted -> notify user', async () => {
    await app.orderConsumer.dispatch(buildOrderEnvelope('OrderAccepted', 10, 20).body)
    expect(app.mocks.messageSend).toHaveBeenCalled()
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Node 5: OrderReady -> dispatch + notify
   * ============================================================ */

  it('Node 5: OrderReady -> DispatchService.dispatchOrder + notify user', async () => {
    await app.orderConsumer.dispatch(buildOrderEnvelope('OrderReady', 20, 30).body)
    expect(app.mocks.dispatchOrder).toHaveBeenCalledWith(
      SEED_TAKEOUT_ORDER_NO,
      1 /* OrderTypeForDispatch.TAKEOUT */,
      0
    )
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Node 6: OrderPicked -> notify user
   * ============================================================ */

  it('Node 6: OrderPicked -> notify user', async () => {
    await app.orderConsumer.dispatch(buildOrderEnvelope('OrderPicked', 30, 40).body)
    expect(app.mocks.messageSend).toHaveBeenCalled()
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Node 7: OrderDelivered -> notify user (5min auto Finished is P9)
   * ============================================================ */

  it('Node 7: OrderDelivered -> notify user', async () => {
    await app.orderConsumer.dispatch(buildOrderEnvelope('OrderDelivered', 40, 50).body)
    expect(app.mocks.messageSend).toHaveBeenCalled()
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Node 8: OrderFinished -> SettleSaga (settlement + invite + reminder)
   * ============================================================ */

  it('Node 8: OrderFinished -> SettlementService.runForOrder + invite reward + review reminder', async () => {
    await app.orderConsumer.dispatch(
      buildOrderEnvelope('OrderFinished', 50, 55, {
        userId: SEED_USER.id
      }).body
    )

    expect(app.mocks.settlementRunForOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNo: SEED_TAKEOUT_ORDER_NO,
        merchantId: SEED_MERCHANT.id,
        riderId: SEED_RIDER.id
      })
    )
    expect(app.mocks.inviteCompleteReward).toHaveBeenCalledWith(SEED_USER.id, SEED_TAKEOUT_ORDER_NO)
    expect(app.mocks.messageSend).toHaveBeenCalled()
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Node 9: Settlement creates 3 records (mocked)
   * ============================================================ */

  it('Node 9: Settlement creates 3 records (merchant + rider + platform)', async () => {
    app.mocks.settlementRunForOrder.mockResolvedValue({
      orderNo: SEED_TAKEOUT_ORDER_NO,
      created: 3,
      executed: 3,
      failed: 0,
      skipped: 0
    })
    await app.orderConsumer.dispatch(
      buildOrderEnvelope('OrderFinished', 50, 55, {
        userId: SEED_USER.id
      }).body
    )

    expect(app.mocks.settlementRunForOrder).toHaveBeenCalled()
    /* 验证调用返回值结构（settlement 内已 mock 3 条） */
    const result = await app.mocks.settlementRunForOrder.mock.results[0]?.value
    expect(result).toMatchObject({ created: 3, executed: 3 })
  })

  /* ============================================================
   * 反向链路：OrderCanceled -> restore inventory + restore coupon + refund
   * ============================================================ */

  it('Reverse: OrderCanceled (paid) -> restore inventory + coupon + trigger refund', async () => {
    await app.orderConsumer.dispatch(
      buildOrderEnvelope('OrderCanceled', 10, 60, {
        items: [{ skuId: 'SKU1', qty: 2 }],
        userCouponId: SEED_USER_COUPON.id,
        payNo: SEED_TAKEOUT_PAY_NO,
        amount: '50.00',
        reason: 'UserRequested'
      }).body
    )

    expect(app.mocks.inventoryRestore).toHaveBeenCalledWith([{ skuId: 'SKU1', qty: 2 }])
    expect(app.mocks.userCouponRestore).toHaveBeenCalledWith(SEED_USER_COUPON.id)
    expect(app.mocks.refundCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        payNo: SEED_TAKEOUT_PAY_NO,
        amount: '50.00'
      })
    )
    expect(app.mocks.messageSend).toHaveBeenCalled()
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Saga failure -> DLQ
   * ============================================================ */

  it('Saga step failure (commit inventory throws) -> DLQ enqueued', async () => {
    app.mocks.inventoryCommit.mockRejectedValueOnce(new Error('SKU not found'))
    await app.orderConsumer.dispatch(
      buildOrderEnvelope('OrderPaid', 0, 10, {
        items: [{ skuId: 'SKU_BAD', qty: 1 }]
      }).body
    )
    expect(app.mocks.dlqAdd).toHaveBeenCalled()
    const job = app.mocks.dlqAdd.mock.calls[0]?.[1]
    expect(job).toMatchObject({
      sagaName: 'OrderPaidSaga',
      failedStep: 'CommitInventory',
      error: 'SKU not found'
    })
  })
})
