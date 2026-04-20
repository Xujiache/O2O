/**
 * @file order.module.ts
 * @stage P4/T4.14~T4.23（Sprint 3 整合）
 * @desc 订单模块装配：外卖 + 跑腿（4 服务）+ 状态机 + 事件 + 取消关单 + 多端查询 + 取件/送达/异常/转单
 * @author 单 Agent V2.0（整合 Subagent 1 + 2 产出）
 *
 * Controllers (5)：
 *   - UserOrderController             /user/order(s) 用户外卖 7 接口
 *   - UserErrandOrderController       /user/order/errand 跑腿下单 + 价格预估 6 接口
 *   - MerchantOrderController         /merchant/order(s) 商户接单/拒单/出餐/打印/列表 5 接口
 *   - RiderOrderController            /rider/order/:orderNo 取件/送达/异常/转单 4 接口
 *   - AdminOrderController            /admin/order(s) 全量/强制取消/仲裁 3 接口
 *
 * Providers (13)：
 *   - 通用：OrderService（含 detail/list/owner 校验/跨表查询）
 *   - 外卖：OrderTakeoutService / OrderPreCheckService / OrderTimeoutScannerService
 *   - 跑腿：OrderErrandService / ErrandPricingService / PickupCodeUtil
 *   - 骑手：RiderActionService
 *   - 状态机 + 事件：OrderStateMachine / orderEventsPublisherProvider
 *   - 异步：OrderCancelTimeoutProcessor（BullMQ）
 *
 * Imports：
 *   - HealthModule（REDIS_CLIENT）
 *   - UserModule（OperationLogService）
 *   - ShopModule（owner 校验、店铺详情）
 *   - ProductModule（库存 InventoryService、商品 ProductService）
 *   - MapModule（withinArea / haversine）
 *   - MarketingModule（DiscountCalc / UserCoupon freeze/use/restore）
 *   - MessageModule（订单状态推送）
 *   - FileModule（凭证图片）
 *   - TypeOrmModule.forFeature([Shop, OrderProof, OrderAfterSale, AbnormalReport, TransferRecord])
 *   - BullModule.registerQueue({ name: 'order-cancel-timeout' })
 *
 * Exports：
 *   - OrderService / OrderStateMachine / OrderTakeoutService / OrderErrandService
 *     供 Sprint 6 Dispatch（grab 后调状态机）+ Sprint 7 Review（仲裁/售后查订单）+ Sprint 8 Orchestration 注入
 *   - REVIEW_DEP_ORDER_SERVICE token：useExisting OrderService → ReviewModule 注入
 */

import { BullModule } from '@nestjs/bullmq'
import { Module, type Provider } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AbnormalReport, OrderAfterSale, OrderProof, Shop, TransferRecord } from '@/entities'
import { HealthModule } from '@/health/health.module'
import { DispatchModule } from '@/modules/dispatch/dispatch.module'
import { FileModule } from '@/modules/file/file.module'
import { MapModule } from '@/modules/map/map.module'
import { MarketingModule } from '@/modules/marketing/marketing.module'
import { MessageModule } from '@/modules/message/message.module'
import { ProductModule } from '@/modules/product/product.module'
import { REVIEW_DEP_ORDER_SERVICE } from '@/modules/review/types/review.types'
import { ShopModule } from '@/modules/shop/shop.module'
import { UserModule } from '@/modules/user/user.module'
import { AdminOrderController } from './controllers/admin-order.controller'
import { MerchantOrderController } from './controllers/merchant-order.controller'
import { RiderOrderController } from './controllers/rider-order.controller'
import { UserErrandOrderController } from './controllers/user-errand-order.controller'
import { UserOrderController } from './controllers/user-order.controller'
import { ORDER_EVENTS_PUBLISHER } from './events/order-events.constants'
import { orderEventsPublisherProvider } from './events/order-events.publisher'
import { OrderCancelTimeoutProcessor } from './processors/order-cancel-timeout.processor'
import { ErrandPricingService } from './services/errand-pricing.service'
import { OrderErrandService } from './services/order-errand.service'
import { OrderPreCheckService } from './services/order-pre-check.service'
import { OrderTakeoutService } from './services/order-takeout.service'
import { OrderTimeoutScannerService } from './services/order-timeout-scanner.service'
import { OrderService } from './services/order.service'
import { PickupCodeUtil } from './services/pickup-code.util'
import { RiderActionService } from './services/rider-action.service'
import { OrderStateMachine } from './state-machine/order-state-machine'

/**
 * Review 模块跨模块依赖注入：将 OrderService 通过 Symbol token 暴露给 ReviewModule
 * 用途：ReviewModule 通过 @Inject(REVIEW_DEP_ORDER_SERVICE) 解耦获得 findByOrderNo 等核心查询能力
 */
const reviewOrderServiceProvider: Provider = {
  provide: REVIEW_DEP_ORDER_SERVICE,
  useExisting: OrderService
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Shop, OrderProof, OrderAfterSale, AbnormalReport, TransferRecord]),
    HealthModule,
    UserModule,
    ShopModule,
    ProductModule,
    MapModule,
    MarketingModule,
    MessageModule,
    FileModule,
    /**
     * I-02 R1：注入 DispatchModule，让 RiderActionService 通过 TransferService 申请转单
     * （DispatchModule 不依赖 OrderModule 任何 provider，仅 import OrderShardingHelper 普通类，
     *   故无模块循环依赖，无需 forwardRef）
     */
    DispatchModule,
    BullModule.registerQueue({ name: 'order-cancel-timeout' })
  ],
  controllers: [
    UserOrderController,
    UserErrandOrderController,
    MerchantOrderController,
    RiderOrderController,
    AdminOrderController
  ],
  providers: [
    OrderService,
    OrderPreCheckService,
    OrderTakeoutService,
    OrderTimeoutScannerService,
    OrderErrandService,
    ErrandPricingService,
    PickupCodeUtil,
    RiderActionService,
    OrderStateMachine,
    orderEventsPublisherProvider,
    OrderCancelTimeoutProcessor,
    reviewOrderServiceProvider
  ],
  exports: [
    OrderService,
    OrderStateMachine,
    OrderTakeoutService,
    OrderErrandService,
    OrderPreCheckService,
    REVIEW_DEP_ORDER_SERVICE,
    ORDER_EVENTS_PUBLISHER
  ]
})
export class OrderModule {}
