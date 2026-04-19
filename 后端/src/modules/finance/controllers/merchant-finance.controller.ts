/**
 * @file merchant-finance.controller.ts
 * @stage P4/T4.30~T4.34（Sprint 5）
 * @desc 商户端财务接口：概览 / 流水 / 提现 / 发票
 * @author 单 Agent V2.0
 *
 * 路径前缀：/api/v1/merchant/...（main.ts setGlobalPrefix）
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('merchant')
 *      所有接口取 currentUser.uid 作为 merchant.id
 *      account 越权防护：service.getOrCreateAccount(2, uid)；其他记录 ownerId === uid
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
import { type CreateWithdrawDto, type QueryWithdrawDto, type WithdrawVo } from '../dto/withdraw.dto'
import { AccountService } from '../services/account.service'
import { InvoiceService } from '../services/invoice.service'
import { WithdrawService } from '../services/withdraw.service'
import {
  AccountOwnerTypeEnum,
  InvoiceApplicantTypeEnum,
  WithdrawOwnerTypeEnum
} from '../types/finance.types'

@ApiTags('财务 - 商户端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes('merchant')
@Controller('merchant')
export class MerchantFinanceController {
  constructor(
    private readonly accountService: AccountService,
    private readonly withdrawService: WithdrawService,
    private readonly invoiceService: InvoiceService
  ) {}

  /* ============================== 概览 ============================== */

  /**
   * 商户账户概览：可用余额 + 冻结 + 累计收入 + 累计支出
   */
  @Get('finance/overview')
  @ApiOperation({ summary: '商户账户概览' })
  @ApiSwaggerResponse({ status: 200 })
  async overview(@CurrentUser('uid') merchantId: string): Promise<AccountVo> {
    const account = await this.accountService.getOrCreateAccount(
      AccountOwnerTypeEnum.MERCHANT,
      merchantId
    )
    return this.accountService.toVo(account)
  }

  /**
   * 商户账户流水（按 biz_type / direction 筛）
   */
  @Get('finance/flows')
  @ApiOperation({ summary: '商户账户流水分页（按业务类型筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  flows(
    @CurrentUser('uid') merchantId: string,
    @Query() query: FlowQueryDto
  ): Promise<PageResult<FlowVo>> {
    return this.accountService.listFlowsByOwner(AccountOwnerTypeEnum.MERCHANT, merchantId, query)
  }

  /* ============================== 提现 ============================== */

  /**
   * 商户提现申请（入参银行卡明文 + 持卡人）
   */
  @Post('withdrawals')
  @ApiOperation({
    summary: '商户提现申请',
    description: '入参银行卡明文 + 持卡人；service 自动 CryptoUtil 三件套加密；冻结余额'
  })
  @ApiSwaggerResponse({ status: 200, description: '申请成功；status=0 申请' })
  applyWithdraw(
    @CurrentUser('uid') merchantId: string,
    @Body() dto: CreateWithdrawDto
  ): Promise<WithdrawVo> {
    return this.withdrawService.apply(WithdrawOwnerTypeEnum.MERCHANT, merchantId, dto)
  }

  /**
   * 商户提现列表
   */
  @Get('withdrawals')
  @ApiOperation({ summary: '我的提现列表（分页 + 状态筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  listWithdraws(
    @CurrentUser('uid') merchantId: string,
    @Query() query: QueryWithdrawDto
  ): Promise<PageResult<WithdrawVo>> {
    return this.withdrawService.listMine(WithdrawOwnerTypeEnum.MERCHANT, merchantId, query)
  }

  /* ============================== 发票 ============================== */

  /**
   * 商户发票申请
   */
  @Post('invoices')
  @ApiOperation({ summary: '商户发票申请（关联订单数组）' })
  @ApiSwaggerResponse({ status: 200, description: '申请成功；status=0 申请' })
  applyInvoice(
    @CurrentUser('uid') merchantId: string,
    @Body() dto: CreateInvoiceDto
  ): Promise<InvoiceVo> {
    return this.invoiceService.apply(InvoiceApplicantTypeEnum.MERCHANT, merchantId, dto)
  }

  /**
   * 商户发票列表
   */
  @Get('invoices')
  @ApiOperation({ summary: '我的发票列表（分页 + 状态筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  listInvoices(
    @CurrentUser('uid') merchantId: string,
    @Query() query: QueryInvoiceDto
  ): Promise<PageResult<InvoiceVo>> {
    return this.invoiceService.listMine(InvoiceApplicantTypeEnum.MERCHANT, merchantId, query)
  }

  /**
   * 商户发票详情（仅本人）
   */
  @Get('invoices/:id')
  @ApiOperation({ summary: '发票详情（仅本人）' })
  @ApiParam({ name: 'id', description: '发票 ID' })
  @ApiSwaggerResponse({ status: 200 })
  @ApiSwaggerResponse({ status: 403, description: '非本人 → 20003' })
  async invoiceDetail(
    @CurrentUser('uid') merchantId: string,
    @Param('id') id: string
  ): Promise<InvoiceVo> {
    await this.invoiceService.assertOwner(id, InvoiceApplicantTypeEnum.MERCHANT, merchantId)
    return this.invoiceService.detail(id)
  }
}
