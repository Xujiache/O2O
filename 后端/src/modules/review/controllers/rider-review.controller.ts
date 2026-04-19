/**
 * @file rider-review.controller.ts
 * @stage P4/T4.44~T4.48（Sprint 7）
 * @desc 骑手端：查差评 + 申诉 + 投诉/工单 提交
 * @author 单 Agent V2.0（Subagent 6 Review + 售后）
 *
 * 路径前缀：/api/v1/rider
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('rider')
 *      所有 :id 接口在 service 层做 owner 校验（review.rider_id === uid）
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
import { ComplaintVo, CreateComplaintDto } from '../dto/complaint.dto'
import { AppealVo, CreateAppealDto, QueryAppealDto } from '../dto/review-appeal.dto'
import { QueryReviewDto, ReviewVo } from '../dto/review.dto'
import { CreateTicketDto, QueryTicketDto, TicketVo } from '../dto/ticket.dto'
import {
  AppellantTypeEnum,
  ComplainantTypeEnum,
  TicketSubmitterTypeEnum
} from '../types/review.types'
import { ComplaintService } from '../services/complaint.service'
import { ReviewAppealService } from '../services/review-appeal.service'
import { ReviewService } from '../services/review.service'
import { TicketService } from '../services/ticket.service'

@ApiTags('评价&售后 - 骑手端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('rider')
@Controller('rider')
export class RiderReviewController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly reviewAppealService: ReviewAppealService,
    private readonly complaintService: ComplaintService,
    private readonly ticketService: TicketService
  ) {}

  /**
   * 查差评（骑手端默认仅 score ≤ 3）
   * 路径：GET /rider/reviews
   */
  @Get('reviews')
  @ApiOperation({
    summary: '查差评',
    description: '默认仅返回 rider_id=当前 uid 且 score ≤ 3 的评价'
  })
  @ApiSwaggerResponse({ status: 200 })
  listMyBadReviews(
    @CurrentUser('uid') riderId: string,
    @Query() query: QueryReviewDto
  ): Promise<PageResult<ReviewVo>> {
    return this.reviewService.listForRider(riderId, query)
  }

  /**
   * 差评申诉
   * 路径：POST /rider/reviews/:id/appeal
   */
  @Post('reviews/:id/appeal')
  @ApiOperation({
    summary: '差评申诉',
    description: '该评价 rider_id 必须 = 当前 uid；7 天内有效'
  })
  @ApiParam({ name: 'id', description: '评价主键' })
  @ApiSwaggerResponse({ status: 200, type: AppealVo })
  appealReview(
    @Param('id') id: string,
    @CurrentUser('uid') riderId: string,
    @Body() dto: CreateAppealDto
  ): Promise<AppealVo> {
    return this.reviewAppealService.submitByRider(id, riderId, dto)
  }

  /**
   * 我的申诉历史
   * 路径：GET /rider/review-appeals
   */
  @Get('review-appeals')
  @ApiOperation({ summary: '我的申诉历史' })
  @ApiSwaggerResponse({ status: 200 })
  listMyAppeals(
    @CurrentUser('uid') riderId: string,
    @Query() query: QueryAppealDto
  ): Promise<PageResult<AppealVo>> {
    return this.reviewAppealService.listByAppellant(AppellantTypeEnum.RIDER, riderId, query)
  }

  /**
   * 提交投诉
   * 路径：POST /rider/complaints
   */
  @Post('complaints')
  @ApiOperation({ summary: '提交投诉（如对用户/商户/平台）' })
  @ApiSwaggerResponse({ status: 200, type: ComplaintVo })
  submitComplaint(
    @CurrentUser('uid') riderId: string,
    @Body() dto: CreateComplaintDto
  ): Promise<ComplaintVo> {
    return this.complaintService.submit(ComplainantTypeEnum.RIDER, riderId, dto)
  }

  /**
   * 提交工单
   * 路径：POST /rider/tickets
   */
  @Post('tickets')
  @ApiOperation({ summary: '提交工单（求助/咨询）' })
  @ApiSwaggerResponse({ status: 200, type: TicketVo })
  submitTicket(
    @CurrentUser('uid') riderId: string,
    @Body() dto: CreateTicketDto
  ): Promise<TicketVo> {
    return this.ticketService.submit(TicketSubmitterTypeEnum.RIDER, riderId, dto)
  }

  /**
   * 我的工单列表
   * 路径：GET /rider/tickets
   */
  @Get('tickets')
  @ApiOperation({ summary: '我的工单列表' })
  @ApiSwaggerResponse({ status: 200 })
  listMyTickets(
    @CurrentUser('uid') riderId: string,
    @Query() query: QueryTicketDto
  ): Promise<PageResult<TicketVo>> {
    return this.ticketService.listBySubmitter(TicketSubmitterTypeEnum.RIDER, riderId, query)
  }
}
