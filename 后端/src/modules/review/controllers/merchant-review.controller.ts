/**
 * @file merchant-review.controller.ts
 * @stage P4/T4.44~T4.48（Sprint 7）
 * @desc 商户端：查评价 + 回复 + 差评申诉 + 处理售后 + 投诉/工单 提交
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 路径前缀：/api/v1/merchant
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('merchant')
 *      所有 :id 接口在 service 层做 owner 校验（review.shop_id ∈ 商户名下 shopIds）
 *
 * shopIds 资源化：通过 reviewService.findShopIdsByMerchant(merchantId) 预先聚合（一次 SQL）
 * 注：商户端不暴露查投诉/仲裁列表（运营场景；如需后续接入）
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { type PageResult } from '@/common'
import { CurrentUser, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, UserTypeGuard } from '@/modules/auth/guards'
import { AfterSaleVo, HandleAfterSaleByMerchantDto, QueryAfterSaleDto } from '../dto/after-sale.dto'
import { ComplaintVo, CreateComplaintDto } from '../dto/complaint.dto'
import { AppealVo, CreateAppealDto, QueryAppealDto } from '../dto/review-appeal.dto'
import { CreateReplyDto, ReplyVo } from '../dto/review-reply.dto'
import { QueryReviewDto, ReviewVo } from '../dto/review.dto'
import { CreateTicketDto, QueryTicketDto, TicketVo } from '../dto/ticket.dto'
import {
  AppellantTypeEnum,
  ComplainantTypeEnum,
  TicketSubmitterTypeEnum
} from '../types/review.types'
import { AfterSaleService } from '../services/after-sale.service'
import { ComplaintService } from '../services/complaint.service'
import { ReviewAppealService } from '../services/review-appeal.service'
import { ReviewReplyService } from '../services/review-reply.service'
import { ReviewService } from '../services/review.service'
import { TicketService } from '../services/ticket.service'

@ApiTags('评价&售后 - 商户端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('merchant')
@Controller('merchant')
export class MerchantReviewController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly reviewReplyService: ReviewReplyService,
    private readonly reviewAppealService: ReviewAppealService,
    private readonly afterSaleService: AfterSaleService,
    private readonly complaintService: ComplaintService,
    private readonly ticketService: TicketService
  ) {}

  /* ==========================================================================
   * 一、查评价 + 回复 + 申诉
   * ========================================================================== */

  /**
   * 查评价（按店铺过滤）
   * 路径：GET /merchant/reviews
   */
  @Get('reviews')
  @ApiOperation({ summary: '查评价（按本商户名下店铺过滤）' })
  @ApiSwaggerResponse({ status: 200 })
  async listReviews(
    @CurrentUser('uid') merchantId: string,
    @Query() query: QueryReviewDto
  ): Promise<PageResult<ReviewVo>> {
    const shopIds = await this.reviewService.findShopIdsByMerchant(merchantId)
    return this.reviewService.listForMerchant(shopIds, query)
  }

  /**
   * 回复评价
   * 路径：POST /merchant/reviews/:id/reply
   */
  @Post('reviews/:id/reply')
  @ApiOperation({
    summary: '商户回复评价',
    description: '该评价必须 review.shop_id ∈ 本商户名下店铺；同一评价可多次回复'
  })
  @ApiParam({ name: 'id', description: '评价主键' })
  @ApiSwaggerResponse({ status: 200, type: ReplyVo })
  async replyReview(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: CreateReplyDto
  ): Promise<ReplyVo> {
    const shopIds = await this.reviewService.findShopIdsByMerchant(merchantId)
    return this.reviewReplyService.merchantReply(id, merchantId, shopIds, dto)
  }

  /**
   * 差评申诉
   * 路径：POST /merchant/reviews/:id/appeal
   */
  @Post('reviews/:id/appeal')
  @ApiOperation({
    summary: '差评申诉',
    description: '仅 score ≤ 3 + 评价后 7 天内可申诉；同评价同商户禁止重复 PENDING 申诉'
  })
  @ApiParam({ name: 'id', description: '评价主键' })
  @ApiSwaggerResponse({ status: 200, type: AppealVo })
  async appealReview(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: CreateAppealDto
  ): Promise<AppealVo> {
    const shopIds = await this.reviewService.findShopIdsByMerchant(merchantId)
    return this.reviewAppealService.submitByMerchant(id, merchantId, shopIds, dto)
  }

  /**
   * 我的申诉历史
   * 路径：GET /merchant/review-appeals
   */
  @Get('review-appeals')
  @ApiOperation({ summary: '我的申诉历史' })
  @ApiSwaggerResponse({ status: 200 })
  listMyAppeals(
    @CurrentUser('uid') merchantId: string,
    @Query() query: QueryAppealDto
  ): Promise<PageResult<AppealVo>> {
    return this.reviewAppealService.listByAppellant(AppellantTypeEnum.MERCHANT, merchantId, query)
  }

  /* ==========================================================================
   * 二、售后
   * ========================================================================== */

  /**
   * 售后工单工作台
   * 路径：GET /merchant/after-sales
   */
  @Get('after-sales')
  @ApiOperation({ summary: '售后工单工作台（按本商户名下店铺过滤）' })
  @ApiSwaggerResponse({ status: 200 })
  async listAfterSales(
    @CurrentUser('uid') merchantId: string,
    @Query() query: QueryAfterSaleDto
  ): Promise<PageResult<AfterSaleVo>> {
    const shopIds = await this.reviewService.findShopIdsByMerchant(merchantId)
    return this.afterSaleService.listForMerchant(shopIds, query)
  }

  /**
   * 处理售后（agree → 触发 refund / reject → 拒绝）
   * 路径：POST /merchant/after-sales/:id/handle
   */
  @Post('after-sales/:id/handle')
  @ApiOperation({
    summary: '处理售后',
    description:
      'agree 必须传 actualAmount ≤ applyAmount；reject 时 merchantReply 必填。' +
      '同意后同步触发退款；退款失败保持 status=30 已同意（待人工补单）'
  })
  @ApiParam({ name: 'id', description: '售后主键' })
  @ApiSwaggerResponse({ status: 200, type: AfterSaleVo })
  async handleAfterSale(
    @Param('id') id: string,
    @CurrentUser('uid') merchantId: string,
    @Body() dto: HandleAfterSaleByMerchantDto
  ): Promise<AfterSaleVo> {
    const shopIds = await this.reviewService.findShopIdsByMerchant(merchantId)
    return this.afterSaleService.merchantHandle(id, merchantId, shopIds, dto)
  }

  /* ==========================================================================
   * 三、投诉 + 工单（商户也可发起）
   * ========================================================================== */

  /**
   * 提交投诉
   * 路径：POST /merchant/complaints
   */
  @Post('complaints')
  @ApiOperation({ summary: '提交投诉（如对骑手/平台/用户）' })
  @ApiSwaggerResponse({ status: 200, type: ComplaintVo })
  submitComplaint(
    @CurrentUser('uid') merchantId: string,
    @Body() dto: CreateComplaintDto
  ): Promise<ComplaintVo> {
    return this.complaintService.submit(ComplainantTypeEnum.MERCHANT, merchantId, dto)
  }

  /**
   * 提交工单
   * 路径：POST /merchant/tickets
   */
  @Post('tickets')
  @ApiOperation({ summary: '提交工单（求助/咨询）' })
  @ApiSwaggerResponse({ status: 200, type: TicketVo })
  submitTicket(
    @CurrentUser('uid') merchantId: string,
    @Body() dto: CreateTicketDto
  ): Promise<TicketVo> {
    return this.ticketService.submit(TicketSubmitterTypeEnum.MERCHANT, merchantId, dto)
  }

  /**
   * 我的工单列表
   * 路径：GET /merchant/tickets
   */
  @Get('tickets')
  @ApiOperation({ summary: '我的工单列表' })
  @ApiSwaggerResponse({ status: 200 })
  listMyTickets(
    @CurrentUser('uid') merchantId: string,
    @Query() query: QueryTicketDto
  ): Promise<PageResult<TicketVo>> {
    return this.ticketService.listBySubmitter(TicketSubmitterTypeEnum.MERCHANT, merchantId, query)
  }
}
