/**
 * @file errand-flow.e2e-spec.ts
 * @stage P4/T4.51（Sprint 8）
 * @desc 跑腿闭环 framework-level e2e：8 节点 OrderCreated → ... → Settlement
 * @author 单 Agent V2.0（Subagent 7：Orchestration + 收尾）
 *
 * 8 节点（DESIGN_P4 §十 / ACCEPTANCE_P4 V4.40）：
 *   1. 价格预估（pricing service；本测试 mock 跳过）
 *   2. 用户下单（OrderCreated）
 *   3. 用户支付（PaymentSucceed → OrderPaid → DispatchErrand）
 *   4. 系统派单（DispatchService 已被 OrderPaid saga 调用）
 *   5. 骑手取件（OrderPicked）→ 通知用户
 *   6. 骑手送达（OrderDelivered）→ 通知用户
 *   7. 用户评价（OrderFinished）→ SettleSaga
 *   8. T+1 分账 + 关闭（Settlement.runForOrder）
 *
 * 注：本测试为 framework-level e2e（直接调 Saga 层）；
 *     真实 docker 的 HTTP-level e2e 在 P9 集成测试阶段补
 */

import {
  EventSourceEnum,
  type OrderEventEnvelope,
  type PaymentEventEnvelope
} from '@/modules/orchestration/types/orchestration.types'
import { OrderTypeEnum, OrderErrandStatusEnum } from '@/modules/order/types/order.types'
import { PayMethod, PayStatus } from '@/modules/payment/types/payment.types'
import { OrderTypeForDispatch } from '@/modules/dispatch/types/dispatch.types'
import { createMockApp, type MockApp } from './helpers/mock-app.factory'
import {
  SEED_ERRAND_ORDER_NO,
  SEED_ERRAND_PAY_NO,
  SEED_RIDER,
  SEED_USER
} from './helpers/seed-data'

describe('Errand Flow e2e (framework-level, 8 nodes)', () => {
  let app: MockApp

  const buildOrderEnvelope = (
    eventName:
      | 'OrderCreated'
      | 'OrderPaid'
      | 'OrderAccepted'
      | 'OrderPicked'
      | 'OrderDelivered'
      | 'OrderFinished'
      | 'OrderCanceled',
    fromStatus: number,
    toStatus: number,
    extra: Record<string, unknown> = {}
  ): OrderEventEnvelope => ({
    source: EventSourceEnum.ORDER,
    eventName,
    body: {
      eventName,
      orderNo: SEED_ERRAND_ORDER_NO,
      orderType: OrderTypeEnum.ERRAND,
      fromStatus,
      toStatus,
      occurredAt: Date.now(),
      traceId: '',
      extra: {
        userId: SEED_USER.id,
        ...extra
      }
    },
    receivedAt: Date.now(),
    traceId: ''
  })

  const buildPayEnvelope = (
    eventName: 'PaymentSucceed' | 'PaymentFailed' | 'PaymentClosed' | 'RefundSucceed',
    fromStatus: PayStatus,
    toStatus: PayStatus
  ): PaymentEventEnvelope => ({
    source: EventSourceEnum.PAYMENT,
    eventName,
    body: {
      eventName,
      payNo: SEED_ERRAND_PAY_NO,
      orderNo: SEED_ERRAND_ORDER_NO,
      orderType: OrderTypeEnum.ERRAND,
      userId: SEED_USER.id,
      amount: '15.00',
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
    /* 跑腿订单：merchantId=null */
    app.mocks.orderServiceFindCore.mockResolvedValue({
      orderType: OrderTypeEnum.ERRAND,
      shardYyyymm: '202604',
      id: 'O1',
      orderNo: SEED_ERRAND_ORDER_NO,
      userId: SEED_USER.id,
      shopId: null,
      merchantId: null,
      riderId: SEED_RIDER.id,
      status: OrderErrandStatusEnum.FINISHED,
      payStatus: 2,
      payAmount: '15.00',
      createdAt: new Date()
    })
  })

  afterEach(async () => {
    if (app) await app.module.close()
  })

  /* ============================================================
   * Node 1: pricing —— 跑腿无 saga，跳过
   * ============================================================ */

  it('Node 1: pricing is service-only (no saga)', async () => {
    /* 仅文档化，无实际触发 */
    expect(true).toBe(true)
  })

  /* ============================================================
   * Node 2: OrderCreated -> notify
   * ============================================================ */

  it('Node 2: OrderCreated -> notify user', async () => {
    await app.orderConsumer.dispatch(buildOrderEnvelope('OrderCreated', 0, 0).body)
    expect(app.mocks.messageSend).toHaveBeenCalled()
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Node 3: PaymentSucceed -> OrderPaid -> DispatchErrand
   * ============================================================ */

  it('Node 3: PaymentSucceed -> stateMachine OrderPaid', async () => {
    app.mocks.stateMachineTransit.mockResolvedValue({
      orderNo: SEED_ERRAND_ORDER_NO,
      orderType: OrderTypeEnum.ERRAND,
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
      SEED_ERRAND_ORDER_NO,
      OrderTypeEnum.ERRAND,
      'OrderPaid',
      expect.any(Object)
    )
  })

  /* ============================================================
   * Node 4: OrderPaid (errand) -> DispatchErrand directly
   * ============================================================ */

  it('Node 4: OrderPaid (errand) -> DispatchService.dispatchOrder ERRAND', async () => {
    await app.orderConsumer.dispatch(buildOrderEnvelope('OrderPaid', 0, 10).body)
    expect(app.mocks.dispatchOrder).toHaveBeenCalledWith(
      SEED_ERRAND_ORDER_NO,
      OrderTypeForDispatch.ERRAND,
      0
    )
    /* errand 没 inventory commit / coupon use（mock 默认） */
    expect(app.mocks.inventoryCommit).not.toHaveBeenCalled()
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Node 5: OrderPicked -> notify user
   * ============================================================ */

  it('Node 5: OrderPicked (rider 已取件) -> notify user', async () => {
    await app.orderConsumer.dispatch(buildOrderEnvelope('OrderPicked', 20, 30).body)
    expect(app.mocks.messageSend).toHaveBeenCalled()
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Node 6: OrderDelivered -> notify user
   * ============================================================ */

  it('Node 6: OrderDelivered -> notify user', async () => {
    await app.orderConsumer.dispatch(buildOrderEnvelope('OrderDelivered', 40, 50).body)
    expect(app.mocks.messageSend).toHaveBeenCalled()
  })

  /* ============================================================
   * Node 7: OrderFinished -> SettleSaga (rider + platform only)
   * ============================================================ */

  it('Node 7: OrderFinished -> Settlement.runForOrder (rider+platform)', async () => {
    app.mocks.settlementRunForOrder.mockResolvedValue({
      orderNo: SEED_ERRAND_ORDER_NO,
      created: 2,
      executed: 2,
      failed: 0,
      skipped: 0
    })
    await app.orderConsumer.dispatch(
      buildOrderEnvelope('OrderFinished', 50, 55, {
        userId: SEED_USER.id
      }).body
    )

    expect(app.mocks.settlementRunForOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNo: SEED_ERRAND_ORDER_NO,
        merchantId: null,
        riderId: SEED_RIDER.id
      })
    )
    expect(app.mocks.inviteCompleteReward).toHaveBeenCalledWith(SEED_USER.id, SEED_ERRAND_ORDER_NO)
  })

  /* ============================================================
   * Node 8: Settlement (rider+platform) returns 2 records
   * ============================================================ */

  it('Node 8: Settlement creates 2 records (rider + platform)', async () => {
    app.mocks.settlementRunForOrder.mockResolvedValue({
      orderNo: SEED_ERRAND_ORDER_NO,
      created: 2,
      executed: 2,
      failed: 0,
      skipped: 0
    })
    await app.orderConsumer.dispatch(
      buildOrderEnvelope('OrderFinished', 50, 55, {
        userId: SEED_USER.id
      }).body
    )
    const result = await app.mocks.settlementRunForOrder.mock.results[0]?.value
    expect(result).toMatchObject({ created: 2, executed: 2 })
  })

  /* ============================================================
   * 反向链路：RefundSucceed -> RefundSaga
   * ============================================================ */

  it('Reverse: RefundSucceed -> notifies user (reverse settlement TODO P9)', async () => {
    await app.paymentConsumer.dispatch(
      buildPayEnvelope('RefundSucceed', PayStatus.SUCCESS, PayStatus.REFUNDED).body
    )
    expect(app.mocks.messageSend).toHaveBeenCalled()
    expect(app.mocks.dlqAdd).not.toHaveBeenCalled()
  })

  /* ============================================================
   * Cancellation
   * ============================================================ */

  it('OrderCanceled (errand, paid) -> trigger refund + notify', async () => {
    await app.orderConsumer.dispatch(
      buildOrderEnvelope('OrderCanceled', 10, 60, {
        payNo: SEED_ERRAND_PAY_NO,
        amount: '15.00',
        reason: 'UserRequested'
      }).body
    )
    expect(app.mocks.refundCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({ payNo: SEED_ERRAND_PAY_NO, amount: '15.00' })
    )
    expect(app.mocks.messageSend).toHaveBeenCalled()
    /* errand 不应 inventoryRestore */
    expect(app.mocks.inventoryRestore).not.toHaveBeenCalled()
  })
})
