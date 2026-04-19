/**
 * @file user-finance.controller.ts
 * @stage P4/T4.30 + T4.34（Sprint 5）
 * @desc 用户端财务接口：钱包余额 / 流水 / 发票
 * @author 单 Agent V2.0
 *
 * 路径前缀：/api/v1/me/...
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('user')
 *      所有接口取 currentUser.uid 作为 user.id
 *
 * 注：用户端不允许提现（业务约束；只有商户/骑手）
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
import { type AccountVo, type FlowQueryDto, type FlowVo } from '../dto/account.dto'
import { type CreateInvoiceDto, type InvoiceVo, type QueryInvoiceDto } from '../dto/invoice.dto'
import { AccountService } from '../services/account.service'
import { InvoiceService } from '../services/invoice.service'
import { AccountOwnerTypeEnum, InvoiceApplicantTypeEnum } from '../types/finance.types'

@ApiTags('财务 - 用户端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('user')
@Controller('me')
export class UserFinanceController {
  constructor(
    private readonly accountService: AccountService,
    private readonly invoiceService: InvoiceService
  ) {}

  /**
   * 用户钱包余额
   */
  @Get('wallet/balance')
  @ApiOperation({ summary: '用户钱包余额（可用 + 冻结 + 累计收支）' })
  @ApiSwaggerResponse({ status: 200 })
  async balance(@CurrentUser('uid') userId: string): Promise<AccountVo> {
    const account = await this.accountService.getOrCreateAccount(AccountOwnerTypeEnum.USER, userId)
    return this.accountService.toVo(account)
  }

  /**
   * 用户钱包流水
   */
  @Get('wallet/flows')
  @ApiOperation({ summary: '用户钱包流水分页（按业务类型筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  flows(
    @CurrentUser('uid') userId: string,
    @Query() query: FlowQueryDto
  ): Promise<PageResult<FlowVo>> {
    return this.accountService.listFlowsByOwner(AccountOwnerTypeEnum.USER, userId, query)
  }

  /**
   * 用户发票申请
   */
  @Post('invoices')
  @ApiOperation({ summary: '用户发票申请（关联订单）' })
  @ApiSwaggerResponse({ status: 200 })
  applyInvoice(
    @CurrentUser('uid') userId: string,
    @Body() dto: CreateInvoiceDto
  ): Promise<InvoiceVo> {
    return this.invoiceService.apply(InvoiceApplicantTypeEnum.USER, userId, dto)
  }

  /**
   * 用户发票列表
   */
  @Get('invoices')
  @ApiOperation({ summary: '我的发票列表' })
  @ApiSwaggerResponse({ status: 200 })
  listInvoices(
    @CurrentUser('uid') userId: string,
    @Query() query: QueryInvoiceDto
  ): Promise<PageResult<InvoiceVo>> {
    return this.invoiceService.listMine(InvoiceApplicantTypeEnum.USER, userId, query)
  }

  /**
   * 用户发票详情（仅本人）
   */
  @Get('invoices/:id')
  @ApiOperation({ summary: '发票详情（仅本人）' })
  @ApiParam({ name: 'id', description: '发票 ID' })
  @ApiSwaggerResponse({ status: 200 })
  @ApiSwaggerResponse({ status: 403, description: '非本人 → 20003' })
  async invoiceDetail(
    @CurrentUser('uid') userId: string,
    @Param('id') id: string
  ): Promise<InvoiceVo> {
    await this.invoiceService.assertOwner(id, InvoiceApplicantTypeEnum.USER, userId)
    return this.invoiceService.detail(id)
  }
}
