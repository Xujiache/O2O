/**
 * @file payment-admin.controller.ts
 * @stage P4/T4.27 + T4.28（Sprint 4）
 * @desc 管理端：人工退款 + 手动对账 + 对账记录分页
 * @author 单 Agent V2.0（Subagent 3 Payment）
 *
 * 路由：
 *   - POST /admin/refund/create        人工退款（写 OperationLog）
 *   - POST /admin/reconciliation/run   手动触发对账
 *   - GET  /admin/reconciliations      对账记录分页
 *
 * 鉴权：@UserTypes('admin') + JwtAuthGuard + UserTypeGuard
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { type PageResult } from '@/common'
import { CurrentUser, Permissions, UserTypes, type AuthUser } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import {
  CreateRefundDto,
  QueryReconciliationDto,
  ReconciliationVo,
  RefundVo,
  RunReconciliationDto
} from '../dto/refund.dto'
import { ReconciliationService } from '../services/reconciliation.service'
import { RefundService } from '../services/refund.service'

/* ============================================================================
 * 1. 退款管理
 * ============================================================================ */

@ApiTags('管理后台 - 退款')
@ApiBearerAuth()
@Controller('admin/refund')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('finance:payment')
@UserTypes('admin')
export class RefundAdminController {
  constructor(private readonly refundService: RefundService) {}

  /**
   * 人工退款（写 OperationLog）
   */
  @Post('create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '管理后台 - 人工退款',
    description: '校验已退累计 + amount ≤ payment.amount，写 refund_record + 调 adapter'
  })
  @ApiSwaggerResponse({ status: 200, type: RefundVo })
  async create(@Body() dto: CreateRefundDto, @CurrentUser() user: AuthUser): Promise<RefundVo> {
    const result = await this.refundService.createRefund({
      payNo: dto.payNo,
      amount: dto.amount,
      reason: dto.reason,
      afterSaleNo: dto.afterSaleNo,
      opAdminId: user.uid
    })
    return {
      refundNo: result.refundNo,
      payNo: result.payNo,
      amount: result.amount,
      status: result.status,
      outRefundNo: result.outRefundNo,
      balanceResult: (result.balanceResult as Record<string, unknown> | undefined) ?? null
    }
  }
}

/* ============================================================================
 * 2. 对账管理
 * ============================================================================ */

@ApiTags('管理后台 - 对账')
@ApiBearerAuth()
@Controller('admin/reconciliation')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('finance:payment')
@UserTypes('admin')
export class ReconciliationAdminController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  /**
   * 手动触发对账
   */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '管理后台 - 手动触发对账',
    description: '指定 channel + billDate（YYYY-MM-DD）；mock 模式生成假对账数据'
  })
  @ApiSwaggerResponse({ status: 200 })
  async run(
    @Body() dto: RunReconciliationDto,
    @CurrentUser() user: AuthUser
  ): Promise<{
    channel: string
    billDate: string
    totalOrders: number
    totalAmount: string
    diffCount: number
    status: number
    reconNo: string
    upsert: 'inserted' | 'updated'
  }> {
    return this.reconciliationService.manualRun(
      dto.channel,
      new Date(`${dto.billDate}T00:00:00+08:00`),
      user.uid
    )
  }
}

@ApiTags('管理后台 - 对账记录')
@ApiBearerAuth()
@Controller('admin/reconciliations')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('finance:payment')
@UserTypes('admin')
export class ReconciliationListAdminController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  /**
   * 对账记录分页
   */
  @Get()
  @ApiOperation({ summary: '管理后台 - 对账记录分页' })
  @ApiSwaggerResponse({ status: 200 })
  list(@Query() query: QueryReconciliationDto): Promise<PageResult<ReconciliationVo>> {
    return this.reconciliationService.list({
      channel: query.channel,
      billDate: query.billDate,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize
    })
  }
}
