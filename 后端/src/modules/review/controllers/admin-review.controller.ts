/**
 * @file admin-review.controller.ts
 * @stage P4/T4.44~T4.48（Sprint 7）
 * @desc 管理端：违规处理 + 申诉审核 + 投诉分派/升级 + 工单管理 + 仲裁裁决 + 售后仲裁
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 路径前缀：/api/v1/admin
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('admin')
 *      所有写操作在 service 层附带 OperationLog（hide / audit / handle / judge / resolve / etc.）
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
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { AfterSaleVo, QueryAfterSaleDto, ResolveAfterSaleDto } from '../dto/after-sale.dto'
import { ArbitrationVo, JudgeArbitrationDto, QueryArbitrationDto } from '../dto/arbitration.dto'
import {
  ComplaintVo,
  EscalateComplaintDto,
  HandleComplaintDto,
  QueryComplaintDto
} from '../dto/complaint.dto'
import { AppealVo, AuditAppealDto, QueryAppealDto } from '../dto/review-appeal.dto'
import { CreateReplyDto, ReplyVo } from '../dto/review-reply.dto'
import { HideReviewDto, QueryReviewDto, ReviewVo, TopReviewDto } from '../dto/review.dto'
import {
  AssignTicketDto,
  CloseTicketDto,
  QueryTicketDto,
  ReplyTicketDto,
  TicketVo
} from '../dto/ticket.dto'
import { AfterSaleService } from '../services/after-sale.service'
import { ArbitrationService } from '../services/arbitration.service'
import { ComplaintService } from '../services/complaint.service'
import { ReviewAppealService } from '../services/review-appeal.service'
import { ReviewReplyService } from '../services/review-reply.service'
import { ReviewService } from '../services/review.service'
import { TicketService } from '../services/ticket.service'

@ApiTags('评价&售后 - 管理端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('review:manage')
@UserTypes('admin')
@Controller('admin')
export class AdminReviewController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly reviewReplyService: ReviewReplyService,
    private readonly reviewAppealService: ReviewAppealService,
    private readonly complaintService: ComplaintService,
    private readonly ticketService: TicketService,
    private readonly arbitrationService: ArbitrationService,
    private readonly afterSaleService: AfterSaleService
  ) {}

  /* ==========================================================================
   * 一、评价 违规处理
   * ========================================================================== */

  @Get('reviews')
  @ApiOperation({ summary: '全量评价（默认含隐藏的）' })
  @ApiSwaggerResponse({ status: 200 })
  listReviews(@Query() query: QueryReviewDto): Promise<PageResult<ReviewVo>> {
    return this.reviewService.listForAdmin(query)
  }

  @Post('reviews/:id/hide')
  @ApiOperation({ summary: '违规处理：隐藏评价（is_hidden=1）' })
  @ApiParam({ name: 'id', description: '评价主键' })
  @ApiSwaggerResponse({ status: 200, type: ReviewVo })
  hideReview(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: HideReviewDto
  ): Promise<ReviewVo> {
    return this.reviewService.hide(id, opAdminId, dto)
  }

  @Post('reviews/:id/top')
  @ApiOperation({ summary: '置顶 / 取消置顶（is_top）' })
  @ApiParam({ name: 'id', description: '评价主键' })
  @ApiSwaggerResponse({ status: 200, type: ReviewVo })
  topReview(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: TopReviewDto
  ): Promise<ReviewVo> {
    return this.reviewService.top(id, opAdminId, dto)
  }

  @Post('reviews/:id/reply')
  @ApiOperation({ summary: '平台官方回复评价（replierType=2）' })
  @ApiParam({ name: 'id', description: '评价主键' })
  @ApiSwaggerResponse({ status: 200, type: ReplyVo })
  replyReview(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: CreateReplyDto
  ): Promise<ReplyVo> {
    return this.reviewReplyService.adminReply(id, opAdminId, dto)
  }

  /* ==========================================================================
   * 二、申诉 审核
   * ========================================================================== */

  @Get('review-appeals')
  @ApiOperation({ summary: '申诉工作台' })
  @ApiSwaggerResponse({ status: 200 })
  listAppeals(@Query() query: QueryAppealDto): Promise<PageResult<AppealVo>> {
    return this.reviewAppealService.listForAdmin(query)
  }

  @Post('review-appeals/:id/audit')
  @ApiOperation({
    summary: '申诉审核',
    description: 'pass → 隐藏被申诉评价 + appeal.status=1 / reject → appeal.status=2'
  })
  @ApiParam({ name: 'id', description: '申诉主键' })
  @ApiSwaggerResponse({ status: 200, type: AppealVo })
  auditAppeal(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: AuditAppealDto
  ): Promise<AppealVo> {
    return this.reviewAppealService.audit(id, opAdminId, dto)
  }

  /* ==========================================================================
   * 三、投诉 工作台 + 处理 + 升级
   * ========================================================================== */

  @Get('complaints')
  @ApiOperation({ summary: '投诉工作台' })
  @ApiSwaggerResponse({ status: 200 })
  listComplaints(@Query() query: QueryComplaintDto): Promise<PageResult<ComplaintVo>> {
    return this.complaintService.listForAdmin(query)
  }

  @Post('complaints/:id/handle')
  @ApiOperation({
    summary: '处理投诉（resolve→2 / close→3）'
  })
  @ApiParam({ name: 'id', description: '投诉主键' })
  @ApiSwaggerResponse({ status: 200, type: ComplaintVo })
  handleComplaint(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: HandleComplaintDto
  ): Promise<ComplaintVo> {
    return this.complaintService.handle(id, opAdminId, dto)
  }

  @Post('complaints/:id/escalate')
  @ApiOperation({
    summary: '升级仲裁',
    description: '新建 arbitration（source_type=2）+ complaint.status=4'
  })
  @ApiParam({ name: 'id', description: '投诉主键' })
  @ApiSwaggerResponse({ status: 200, type: ComplaintVo })
  escalateComplaint(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: EscalateComplaintDto
  ): Promise<ComplaintVo> {
    return this.complaintService.escalate(id, opAdminId, dto)
  }

  /* ==========================================================================
   * 四、工单 工作台 + 分派 + 回复 + 关闭
   * ========================================================================== */

  @Get('tickets')
  @ApiOperation({ summary: '工单工作台' })
  @ApiSwaggerResponse({ status: 200 })
  listTickets(@Query() query: QueryTicketDto): Promise<PageResult<TicketVo>> {
    return this.ticketService.listForAdmin(query)
  }

  @Post('tickets/:id/assign')
  @ApiOperation({ summary: '分派工单' })
  @ApiParam({ name: 'id', description: '工单主键' })
  @ApiSwaggerResponse({ status: 200, type: TicketVo })
  assignTicket(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: AssignTicketDto
  ): Promise<TicketVo> {
    return this.ticketService.assign(id, opAdminId, dto)
  }

  @Post('tickets/:id/reply')
  @ApiOperation({ summary: '客服回复工单' })
  @ApiParam({ name: 'id', description: '工单主键' })
  @ApiSwaggerResponse({ status: 200, type: TicketVo })
  replyTicket(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: ReplyTicketDto
  ): Promise<TicketVo> {
    return this.ticketService.reply(id, opAdminId, dto)
  }

  @Post('tickets/:id/close')
  @ApiOperation({ summary: '关闭工单' })
  @ApiParam({ name: 'id', description: '工单主键' })
  @ApiSwaggerResponse({ status: 200, type: TicketVo })
  closeTicket(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: CloseTicketDto
  ): Promise<TicketVo> {
    return this.ticketService.close(id, opAdminId, dto)
  }

  /* ==========================================================================
   * 五、仲裁 工作台 + 裁决
   * ========================================================================== */

  @Get('arbitrations')
  @ApiOperation({ summary: '仲裁工作台' })
  @ApiSwaggerResponse({ status: 200 })
  listArbitrations(@Query() query: QueryArbitrationDto): Promise<PageResult<ArbitrationVo>> {
    return this.arbitrationService.listForAdmin(query)
  }

  @Post('arbitrations/:id/judge')
  @ApiOperation({
    summary: '裁决仲裁',
    description:
      'decision ∈ {1,2,3,4}；申请方=用户 + decision ∈ {1,3} + decisionAmount > 0 → 自动触发退款'
  })
  @ApiParam({ name: 'id', description: '仲裁主键' })
  @ApiSwaggerResponse({ status: 200, type: ArbitrationVo })
  judgeArbitration(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: JudgeArbitrationDto
  ): Promise<ArbitrationVo> {
    return this.arbitrationService.judge(id, opAdminId, dto)
  }

  /* ==========================================================================
   * 六、售后 工作台 + 仲裁
   * ========================================================================== */

  @Get('after-sales')
  @ApiOperation({ summary: '售后工作台' })
  @ApiSwaggerResponse({ status: 200 })
  listAfterSales(@Query() query: QueryAfterSaleDto): Promise<PageResult<AfterSaleVo>> {
    return this.afterSaleService.listForAdmin(query)
  }

  @Post('after-sales/:id/resolve')
  @ApiOperation({
    summary: '管理员仲裁售后（agree → 触发 refund / reject → 拒绝）',
    description: '仅 status=20 平台仲裁中可处理；agree 必须传 actualAmount'
  })
  @ApiParam({ name: 'id', description: '售后主键' })
  @ApiSwaggerResponse({ status: 200, type: AfterSaleVo })
  resolveAfterSale(
    @Param('id') id: string,
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: ResolveAfterSaleDto
  ): Promise<AfterSaleVo> {
    return this.afterSaleService.adminResolve(id, opAdminId, dto)
  }
}
