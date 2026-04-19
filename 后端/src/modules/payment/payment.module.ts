/**
 * @file payment.module.ts
 * @stage P4/T4.24~T4.29（Sprint 4）
 * @desc 支付模块装配：6 service + 5 controller + 3 adapter + Cron processor + Adapter Provider Factory
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 任务覆盖：
 *   T4.24 微信支付 V3（JSAPI/APP/Native） + 回调（mock 优先）
 *   T4.25 支付宝（WAP/APP） + 回调
 *   T4.26 余额支付 + 风控
 *   T4.27 退款（create + 回调 + 幂等）
 *   T4.28 每日对账任务（@Cron 02:00）
 *   T4.29 支付状态机 + 事件
 *
 * Controllers (5)：
 *   - PaymentController                    /payment              用户端 create + status
 *   - WxPayNotifyController                /payment/wx           @Public 微信回调
 *   - AlipayNotifyController               /payment/alipay       @Public 支付宝回调
 *   - RefundNotifyController               /payment/refund/notify @Public 退款回调
 *   - RefundAdminController                /admin/refund         管理端人工退款
 *   - ReconciliationAdminController        /admin/reconciliation 管理端手动对账
 *   - ReconciliationListAdminController    /admin/reconciliations 对账记录分页
 *
 * Providers (6 service + 3 adapter + 1 cron + 1 publisher provider)：
 *   - PaymentService（主入口）
 *   - PaymentStateMachine（T4.29 状态机）
 *   - RefundService（T4.27 退款）
 *   - BalanceService（T4.26 余额支付）
 *   - ReconciliationService（T4.28 对账）
 *   - WxPayAdapter / AlipayAdapter / BalanceAdapter
 *   - PAYMENT_ADAPTER_REGISTRY（Map<PayMethod, IPaymentAdapter>）
 *   - paymentEventsPublisherProvider（PAYMENT_EVENTS_PUBLISHER 双模式）
 *   - ReconciliationCronProcessor（@Cron 02:00）
 *
 * Imports：
 *   - TypeOrmModule.forFeature([PaymentRecord, RefundRecord, Account, AccountFlow, Reconciliation])
 *   - HealthModule（REDIS_CLIENT）
 *   - UserModule（OperationLogService）
 *   - ScheduleModule.forRoot()（@Cron 装饰器依赖）
 *
 * Exports：
 *   - PaymentService / RefundService / BalanceService / ReconciliationService
 *     供 Sprint 8 Orchestration 跨模块编排注入
 */

import { Module, type Provider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Account, AccountFlow, PaymentRecord, Reconciliation, RefundRecord } from '@/entities'
import { HealthModule } from '@/health/health.module'
import { REVIEW_DEP_REFUND_SERVICE } from '@/modules/review/types/review.types'
import { UserModule } from '@/modules/user/user.module'
import { AlipayAdapter } from './adapters/alipay.adapter'
import { BalanceAdapter } from './adapters/balance.adapter'
import {
  PAYMENT_ADAPTER_REGISTRY,
  type IPaymentAdapter
} from './adapters/payment-adapter.interface'
import { WxPayAdapter } from './adapters/wx-pay.adapter'
import { AlipayNotifyController } from './controllers/alipay-notify.controller'
import {
  ReconciliationAdminController,
  ReconciliationListAdminController,
  RefundAdminController
} from './controllers/payment-admin.controller'
import { PaymentController } from './controllers/payment.controller'
import { RefundNotifyController } from './controllers/refund-notify.controller'
import { WxPayNotifyController } from './controllers/wx-pay-notify.controller'
import { ReconciliationCronProcessor } from './processors/reconciliation-cron.processor'
import { BalanceService } from './services/balance.service'
import { paymentEventsPublisherProvider } from './services/payment-events.publisher'
import { PaymentStateMachine } from './services/payment-state-machine'
import { PaymentService } from './services/payment.service'
import { ReconciliationService } from './services/reconciliation.service'
import { RefundService } from './services/refund.service'
import { PayMethod } from './types/payment.types'

/* ============================================================================
 * Adapter Registry Provider
 *
 * 设计：
 *   - useFactory 接收 3 个 adapter 实例，按 PayMethod 装入 Map
 *   - PaymentService / RefundService 通过 @Inject(PAYMENT_ADAPTER_REGISTRY) 拿 Map
 *   - 解耦 service 和具体 adapter 类（便于单测时 mock）
 * ============================================================================ */

const adapterRegistryProvider: Provider = {
  provide: PAYMENT_ADAPTER_REGISTRY,
  useFactory: (
    wx: WxPayAdapter,
    alipay: AlipayAdapter,
    balance: BalanceAdapter
  ): Map<PayMethod, IPaymentAdapter> => {
    const map = new Map<PayMethod, IPaymentAdapter>()
    map.set(PayMethod.WX_PAY, wx)
    map.set(PayMethod.ALIPAY, alipay)
    map.set(PayMethod.BALANCE, balance)
    return map
  },
  inject: [WxPayAdapter, AlipayAdapter, BalanceAdapter]
}

/**
 * Review 模块跨模块依赖注入：把 RefundService 通过 Symbol token 暴露给 ReviewModule
 * 用途：ReviewModule 仲裁裁决/售后同意时调 refund.service.createRefund 触发退款
 */
const reviewRefundServiceProvider: Provider = {
  provide: REVIEW_DEP_REFUND_SERVICE,
  useExisting: RefundService
}

/* ============================================================================
 * Module
 * ============================================================================ */

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentRecord, RefundRecord, Account, AccountFlow, Reconciliation]),
    HealthModule,
    UserModule,
    /* ScheduleModule.forRoot() 在 app.module.ts 未注册（任务约束）；本模块自管 */
    ScheduleModule.forRoot()
  ],
  controllers: [
    PaymentController,
    WxPayNotifyController,
    AlipayNotifyController,
    RefundNotifyController,
    RefundAdminController,
    ReconciliationAdminController,
    ReconciliationListAdminController
  ],
  providers: [
    /* Adapters（3 个） */
    WxPayAdapter,
    AlipayAdapter,
    BalanceAdapter,
    adapterRegistryProvider,

    /* 6 Services */
    PaymentService,
    PaymentStateMachine,
    RefundService,
    BalanceService,
    ReconciliationService,
    paymentEventsPublisherProvider,

    /* Cron */
    ReconciliationCronProcessor,

    /* ConfigService 在 ConfigModule isGlobal=true 已 export，可直接注入 */
    ConfigService,

    /* Review 模块跨模块依赖（Symbol token） */
    reviewRefundServiceProvider
  ],
  exports: [
    PaymentService,
    RefundService,
    BalanceService,
    ReconciliationService,
    PaymentStateMachine,
    REVIEW_DEP_REFUND_SERVICE
  ]
})
export class PaymentModule {}
