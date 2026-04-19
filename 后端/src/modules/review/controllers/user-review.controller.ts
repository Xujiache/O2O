/**
 * @file user-review.controller.ts
 * @stage P4/T4.44~T4.48（Sprint 7）
 * @desc 用户端：评价 + 售后 + 投诉 + 主动申请仲裁 + 工单
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 路径前缀：/api/v1（main.ts 全局前缀）
 * 鉴权：类级 JwtAuthGuard + UserTypeGuard + @UserTypes('user')
 *      所有写接口在 service 层做 owner 校验（user_id === uid）
 */

import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
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
import {
  AfterSaleVo,
  CreateAfterSaleDto,
  EscalateAfterSaleByUserDto,
  QueryAfterSaleDto
} from '../dto/after-sale.dto'
import { ArbitrationVo, CreateArbitrationDto, QueryArbitrationDto } from '../dto/arbitration.dto'
import { ComplaintVo, CreateComplaintDto, QueryComplaintDto } from '../dto/complaint.dto'
import { QueryReviewDto, ReviewVo, SubmitReviewDto, UpdateReviewDto } from '../dto/review.dto'
import { CreateTicketDto, QueryTicketDto, TicketVo } from '../dto/ticket.dto'
import {
  ArbitrationPartyTypeEnum,
  ComplainantTypeEnum,
  TicketSubmitterTypeEnum
} from '../types/review.types'
import { AfterSaleService } from '../services/after-sale.service'
import { ArbitrationService } from '../services/arbitration.service'
import { ComplaintService } from '../services/complaint.service'
import { ReviewService } from '../services/review.service'
import { TicketService } from '../services/ticket.service'

@ApiTags('评价&售后 - 用户端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user')
@Controller()
export class UserReviewController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly afterSaleService: AfterSaleService,
    private readonly complaintService: ComplaintService,
    private readonly arbitrationService: ArbitrationService,
    private readonly ticketService: TicketService
  ) {}

  /* ==========================================================================
   * 一、评价
   * ========================================================================== */

  /**
   * 提交评价
   * 路径：POST /me/reviews
   */
  @Post('me/reviews')
  @ApiOperation({
    summary: '提交评价（一单一评 + 15 天有效期 + 24h 内可改）',
    description:
      '订单需 status=55 已完成且完成后 ≤ 15 天；同 (orderNo, targetType, targetId) 仅能评一次（uk）。'
  })
  @ApiSwaggerResponse({ status: 200, type: ReviewVo })
  submitReview(
    @CurrentUser('uid') userId: string,
    @Body() dto: SubmitReviewDto
  ): Promise<ReviewVo> {
    return this.reviewService.submit(userId, dto)
  }

  /**
   * 修改评价（24h 窗口）
   * 路径：PUT /me/reviews/:id
   */
  @Put('me/reviews/:id')
  @ApiOperation({
    summary: '修改评价（提交后 24h 内可改；之后锁定）'
  })
  @ApiParam({ name: 'id', description: '评价主键' })
  @ApiSwaggerResponse({ status: 200, type: ReviewVo })
  updateReview(
    @Param('id') id: string,
    @CurrentUser('uid') userId: string,
    @Body() dto: UpdateReviewDto
  ): Promise<ReviewVo> {
    return this.reviewService.update(id, userId, dto)
  }

  /**
   * 我的评价列表
   * 路径：GET /me/reviews
   */
  @Get('me/reviews')
  @ApiOperation({ summary: '我的评价列表（按时间倒序）' })
  @ApiSwaggerResponse({ status: 200 })
  listMyReviews(
    @CurrentUser('uid') userId: string,
    @Query() query: QueryReviewDto
  ): Promise<PageResult<ReviewVo>> {
    return this.reviewService.listForUser(userId, query)
  }

  /* ==========================================================================
   * 二、售后
   * ========================================================================== */

  /**
   * 申请售后
   * 路径：POST /me/order/:orderNo/after-sales
   */
  @Post('me/order/:orderNo/after-sales')
  @ApiOperation({
    summary: '申请售后',
    description: '订单需 status=55；applyAmount ≤ 订单 payAmount。'
  })
  @ApiParam({ name: 'orderNo', description: '18 位订单号' })
  @ApiSwaggerResponse({ status: 200, type: AfterSaleVo })
  createAfterSale(
    @Param('orderNo') orderNo: string,
    @CurrentUser('uid') userId: string,
    @Body() dto: CreateAfterSaleDto
  ): Promise<AfterSaleVo> {
    return this.afterSaleService.create(userId, orderNo, dto)
  }

  /**
   * 我的售后列表
   * 路径：GET /me/after-sales
   */
  @Get('me/after-sales')
  @ApiOperation({ summary: '我的售后列表（按状态/类型筛选 + 时间倒序）' })
  @ApiSwaggerResponse({ status: 200 })
  listMyAfterSales(
    @CurrentUser('uid') userId: string,
    @Query() query: QueryAfterSaleDto
  ): Promise<PageResult<AfterSaleVo>> {
    return this.afterSaleService.listForUser(userId, query)
  }

  /**
   * 升级仲裁（仅 status=40 已拒绝）
   * 路径：POST /me/after-sales/:id/escalate
   */
  @Post('me/after-sales/:id/escalate')
  @ApiOperation({
    summary: '售后升级仲裁',
    description: '仅在售后已被商户拒绝(status=40) 时可升级；自动新建仲裁单'
  })
  @ApiParam({ name: 'id', description: '售后主键' })
  @ApiSwaggerResponse({ status: 200, type: AfterSaleVo })
  escalateAfterSale(
    @Param('id') id: string,
    @CurrentUser('uid') userId: string,
    @Body() dto: EscalateAfterSaleByUserDto
  ): Promise<AfterSaleVo> {
    return this.afterSaleService.userEscalate(id, userId, dto)
  }

  /**
   * 撤销售后
   * 路径：POST /me/after-sales/:id/close
   */
  @Post('me/after-sales/:id/close')
  @ApiOperation({
    summary: '撤销售后（仅 status ∈ {0, 10, 40} 时可关闭）'
  })
  @ApiParam({ name: 'id', description: '售后主键' })
  @ApiSwaggerResponse({ status: 200, type: AfterSaleVo })
  closeAfterSale(
    @Param('id') id: string,
    @CurrentUser('uid') userId: string
  ): Promise<AfterSaleVo> {
    return this.afterSaleService.userClose(id, userId)
  }

  /* ==========================================================================
   * 三、投诉
   * ========================================================================== */

  /**
   * 提交投诉
   * 路径：POST /me/complaints
   */
  @Post('me/complaints')
  @ApiOperation({
    summary: '提交投诉',
    description: 'target_type=4 时不传 targetId；orderNo / orderType 同传或同空'
  })
  @ApiSwaggerResponse({ status: 200, type: ComplaintVo })
  submitComplaint(
    @CurrentUser('uid') userId: string,
    @Body() dto: CreateComplaintDto
  ): Promise<ComplaintVo> {
    return this.complaintService.submit(ComplainantTypeEnum.USER, userId, dto)
  }

  /**
   * 我的投诉列表
   * 路径：GET /me/complaints
   */
  @Get('me/complaints')
  @ApiOperation({ summary: '我的投诉列表（按状态筛 + 时间倒序）' })
  @ApiSwaggerResponse({ status: 200 })
  listMyComplaints(
    @CurrentUser('uid') userId: string,
    @Query() query: QueryComplaintDto
  ): Promise<PageResult<ComplaintVo>> {
    return this.complaintService.listByComplainant(ComplainantTypeEnum.USER, userId, query)
  }

  /* ==========================================================================
   * 四、主动申请仲裁
   * ========================================================================== */

  /**
   * 主动申请仲裁（source_type=3）
   * 路径：POST /me/arbitrations
   */
  @Post('me/arbitrations')
  @ApiOperation({
    summary: '主动申请仲裁',
    description: '需关联订单；与售后/投诉转仲裁互不冲突'
  })
  @ApiSwaggerResponse({ status: 200, type: ArbitrationVo })
  createArbitration(
    @CurrentUser('uid') userId: string,
    @Body() dto: CreateArbitrationDto
  ): Promise<ArbitrationVo> {
    return this.arbitrationService.createDirect(ArbitrationPartyTypeEnum.USER, userId, dto)
  }

  /**
   * 我的仲裁列表
   * 路径：GET /me/arbitrations
   */
  @Get('me/arbitrations')
  @ApiOperation({ summary: '我的仲裁列表（按状态/来源筛 + 时间倒序）' })
  @ApiSwaggerResponse({ status: 200 })
  listMyArbitrations(
    @CurrentUser('uid') userId: string,
    @Query() query: QueryArbitrationDto
  ): Promise<PageResult<ArbitrationVo>> {
    return this.arbitrationService.listByApplicant(ArbitrationPartyTypeEnum.USER, userId, query)
  }

  /* ==========================================================================
   * 五、工单（求助）
   * ========================================================================== */

  /**
   * 提交工单（求助）
   * 路径：POST /me/tickets
   */
  @Post('me/tickets')
  @ApiOperation({ summary: '提交工单（求助/咨询）' })
  @ApiSwaggerResponse({ status: 200, type: TicketVo })
  submitTicket(
    @CurrentUser('uid') userId: string,
    @Body() dto: CreateTicketDto
  ): Promise<TicketVo> {
    return this.ticketService.submit(TicketSubmitterTypeEnum.USER, userId, dto)
  }

  /**
   * 我的工单列表
   * 路径：GET /me/tickets
   */
  @Get('me/tickets')
  @ApiOperation({ summary: '我的工单列表（按状态/优先级筛 + 时间倒序）' })
  @ApiSwaggerResponse({ status: 200 })
  listMyTickets(
    @CurrentUser('uid') userId: string,
    @Query() query: QueryTicketDto
  ): Promise<PageResult<TicketVo>> {
    return this.ticketService.listBySubmitter(TicketSubmitterTypeEnum.USER, userId, query)
  }
}
