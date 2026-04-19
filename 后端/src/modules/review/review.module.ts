/**
 * @file review.module.ts
 * @stage P4/T4.44~T4.48（Sprint 7 整合）
 * @desc 评价 + 售后 + 投诉 + 工单 + 仲裁 模块装配
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * Controllers (4)：
 *   - UserReviewController       /me/reviews etc.（评价 + 售后 + 投诉 + 主动仲裁 + 工单）
 *   - MerchantReviewController   /merchant/...（查评价 + 回复 + 申诉 + 处理售后 + 投诉/工单）
 *   - RiderReviewController      /rider/...（查差评 + 申诉 + 投诉/工单）
 *   - AdminReviewController      /admin/...（违规 + 申诉审核 + 投诉处理/升级 + 工单管理 + 仲裁裁决 + 售后仲裁）
 *
 * Providers (7)：
 *   - ReviewService              T4.44 评价主服务（含 shop/product 评分聚合 + 商户 shopId 反查）
 *   - ReviewReplyService         T4.44 评价回复（商户 / 平台官方）
 *   - ReviewAppealService        T4.45 申诉（商户/骑手 → admin 审核）
 *   - ComplaintService           T4.46 投诉（admin handle / escalate）
 *   - TicketService              T4.46 工单 CRUD
 *   - ArbitrationService         T4.47 仲裁主动申请 + admin 裁决（触发 RefundService）
 *   - AfterSaleService           T4.48 售后状态机（含商户处理 / 用户升级 / admin 仲裁）
 *
 * Imports：
 *   - HealthModule                 （REDIS_CLIENT；当前 review 模块未直接 Redis，预留扩展）
 *   - UserModule                   （OperationLogService）
 *   - FileModule                   （证据图片可走 FileService.getById；当前由 controller URL 直传）
 *   - MessageModule                （评价/裁决/退款通知；本期 service 内未触发，由 Sprint 8 orchestration 统一）
 *   - forwardRef(() => OrderModule)（避免与 OrderService 循环依赖；通过 token 注入实现）
 *   - forwardRef(() => PaymentModule)（同上，注入 RefundService）
 *   - TypeOrmModule.forFeature(D8 6 实体 + Shop + Product + OrderAfterSale)
 *
 * 跨模块依赖契约（types/review.types.ts）：
 *   - REVIEW_DEP_ORDER_SERVICE   Symbol token；OrderModule 应在装配时通过
 *     `{ provide: REVIEW_DEP_ORDER_SERVICE, useExisting: OrderService }` 暴露
 *   - REVIEW_DEP_REFUND_SERVICE  同上；PaymentModule 通过
 *     `{ provide: REVIEW_DEP_REFUND_SERVICE, useExisting: RefundService }` 暴露
 *   - 集成阶段未就绪时本模块通过 `@Optional()` 注入；运行时调用会抛 BIZ_OPERATION_FORBIDDEN
 *
 * Exports：
 *   - 6 个核心 service（供 Sprint 8 orchestration / 其他业务模块按需注入）
 */

import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  Arbitration,
  Complaint,
  OrderAfterSale,
  Product,
  Review,
  ReviewAppeal,
  ReviewReply,
  Shop,
  Ticket
} from '@/entities'
import { HealthModule } from '@/health/health.module'
import { FileModule } from '@/modules/file/file.module'
import { MessageModule } from '@/modules/message/message.module'
import { OrderModule } from '@/modules/order/order.module'
import { PaymentModule } from '@/modules/payment/payment.module'
import { UserModule } from '@/modules/user/user.module'
import { AdminReviewController } from './controllers/admin-review.controller'
import { MerchantReviewController } from './controllers/merchant-review.controller'
import { RiderReviewController } from './controllers/rider-review.controller'
import { UserReviewController } from './controllers/user-review.controller'
import { AfterSaleService } from './services/after-sale.service'
import { ArbitrationService } from './services/arbitration.service'
import { ComplaintService } from './services/complaint.service'
import { ReviewAppealService } from './services/review-appeal.service'
import { ReviewReplyService } from './services/review-reply.service'
import { ReviewService } from './services/review.service'
import { TicketService } from './services/ticket.service'

@Module({
  imports: [
    HealthModule,
    UserModule,
    FileModule,
    MessageModule,
    forwardRef(() => OrderModule),
    forwardRef(() => PaymentModule),
    TypeOrmModule.forFeature([
      /* D8 评价域 6 实体 */
      Review,
      ReviewReply,
      ReviewAppeal,
      Complaint,
      Arbitration,
      Ticket,
      /* D4 订单域：售后单 */
      OrderAfterSale,
      /* D3 店铺/商品（评分聚合 + 商户 shopId 反查） */
      Shop,
      Product
    ])
  ],
  controllers: [
    UserReviewController,
    MerchantReviewController,
    RiderReviewController,
    AdminReviewController
  ],
  providers: [
    ReviewService,
    ReviewReplyService,
    ReviewAppealService,
    ComplaintService,
    TicketService,
    ArbitrationService,
    AfterSaleService
  ],
  exports: [
    ReviewService,
    ReviewReplyService,
    ReviewAppealService,
    ComplaintService,
    TicketService,
    ArbitrationService,
    AfterSaleService
  ]
})
export class ReviewModule {}
