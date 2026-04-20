/**
 * @file admin-finance.controller.ts
 * @stage P4/T4.31~T4.35（Sprint 5）
 * @desc 管理端财务接口：分账规则 CRUD / 分账记录 / 提现审核打款 /
 *       发票审核开票 / 对账报表 Excel 下载 / 人工调账
 * @author 单 Agent V2.0
 *
 * 路径前缀：/api/v1/admin/...
 * 鉴权：JwtAuthGuard + UserTypeGuard + @UserTypes('admin')
 *      所有写操作 service 层已自动写 OperationLog
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse as ApiSwaggerResponse,
  ApiTags
} from '@nestjs/swagger'
import { type Response } from 'express'
import { type PageResult } from '@/common'
import { CurrentUser, Permissions, UserTypes } from '@/modules/auth/decorators'
import { JwtAuthGuard, PermissionGuard, UserTypeGuard } from '@/modules/auth/guards'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { type AccountVo, type AdjustBalanceDto, type FlowVo } from '../dto/account.dto'
import {
  type AuditInvoiceDto,
  type InvoiceVo,
  type IssueInvoiceDto,
  type QueryInvoiceDto
} from '../dto/invoice.dto'
import { type ReportQueryDto } from '../dto/recon-report.dto'
import {
  type CreateSettlementRuleDto,
  type QuerySettlementRecordDto,
  type QuerySettlementRuleDto,
  type RunOnceDto,
  type RunOnceResultVo,
  type SettlementRecordVo,
  type SettlementRuleVo,
  type UpdateSettlementRuleDto
} from '../dto/settlement.dto'
import { type AuditWithdrawDto, type QueryWithdrawDto, type WithdrawVo } from '../dto/withdraw.dto'
import { AccountService } from '../services/account.service'
import { InvoiceService } from '../services/invoice.service'
import { ReconciliationReportService } from '../services/reconciliation-report.service'
import { SettlementCronService } from '../services/settlement-cron.service'
import { SettlementRuleService } from '../services/settlement-rule.service'
import { SettlementService } from '../services/settlement.service'
import { WithdrawService } from '../services/withdraw.service'

@ApiTags('财务 - 管理端')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, UserTypeGuard, PermissionGuard)
@Permissions('finance:manage')
@UserTypes('admin')
@Controller('admin')
export class AdminFinanceController {
  constructor(
    private readonly accountService: AccountService,
    private readonly settlementRuleService: SettlementRuleService,
    private readonly settlementService: SettlementService,
    private readonly settlementCronService: SettlementCronService,
    private readonly withdrawService: WithdrawService,
    private readonly invoiceService: InvoiceService,
    private readonly reportService: ReconciliationReportService,
    private readonly operationLogService: OperationLogService
  ) {}

  /* ==========================================================================
   * 一、分账规则 CRUD（T4.31）
   * ========================================================================== */

  /**
   * 新建分账规则
   */
  @Post('settlement-rules')
  @ApiOperation({ summary: '新建分账规则' })
  @ApiSwaggerResponse({ status: 200 })
  createRule(
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: CreateSettlementRuleDto
  ): Promise<SettlementRuleVo> {
    return this.settlementRuleService.create(dto, opAdminId)
  }

  /**
   * 规则列表
   */
  @Get('settlement-rules')
  @ApiOperation({ summary: '分账规则分页列表（场景/对象/范围/状态筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  listRules(@Query() query: QuerySettlementRuleDto): Promise<PageResult<SettlementRuleVo>> {
    return this.settlementRuleService.list(query)
  }

  /**
   * 规则详情
   */
  @Get('settlement-rules/:id')
  @ApiOperation({ summary: '分账规则详情' })
  @ApiParam({ name: 'id', description: '规则 ID' })
  @ApiSwaggerResponse({ status: 200 })
  ruleDetail(@Param('id') id: string): Promise<SettlementRuleVo> {
    return this.settlementRuleService.detail(id)
  }

  /**
   * 编辑规则
   */
  @Put('settlement-rules/:id')
  @ApiOperation({ summary: '编辑分账规则（部分字段；ruleCode/scene/targetType 不可改）' })
  @ApiParam({ name: 'id', description: '规则 ID' })
  @ApiSwaggerResponse({ status: 200 })
  updateRule(
    @CurrentUser('uid') opAdminId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSettlementRuleDto
  ): Promise<SettlementRuleVo> {
    return this.settlementRuleService.update(id, dto, opAdminId)
  }

  /**
   * 软删规则
   */
  @Delete('settlement-rules/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软删分账规则' })
  @ApiParam({ name: 'id', description: '规则 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async removeRule(
    @CurrentUser('uid') opAdminId: string,
    @Param('id') id: string
  ): Promise<{ deleted: boolean }> {
    await this.settlementRuleService.remove(id, opAdminId)
    return { deleted: true }
  }

  /* ==========================================================================
   * 二、分账记录 + 手动触发（T4.32）
   * ========================================================================== */

  /**
   * 手动触发分账（运维补跑）
   *
   * 输入：date yyyyMMdd
   * 输出：RunOnceResultVo
   */
  @Post('settlement/run-once')
  @ApiOperation({
    summary: '手动触发分账（按业务日补跑）',
    description: '入参 date=yyyyMMdd；扫描该日 finished 订单 → compute + execute'
  })
  @ApiSwaggerResponse({ status: 200 })
  async runOnce(
    @CurrentUser('uid') opAdminId: string,
    @Body() dto: RunOnceDto
  ): Promise<RunOnceResultVo> {
    const targetDay = this.settlementCronService.parseYyyymmdd(dto.date)
    const result = await this.settlementCronService.runForDate(targetDay)
    await this.operationLogService.write({
      opAdminId,
      module: 'finance',
      action: 'settlement_run_once',
      resourceType: 'settlement',
      resourceId: dto.date,
      description: `手动触发 ${dto.date} 分账：scanned=${result.scannedOrders} created=${result.createdRecords} executed=${result.executedRecords} failed=${result.failedRecords}`,
      extra: { ...result }
    })
    return result
  }

  /**
   * 分账记录分页
   */
  @Get('settlement-records')
  @ApiOperation({ summary: '分账记录分页（订单号/对象/状态筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  listRecords(@Query() query: QuerySettlementRecordDto): Promise<PageResult<SettlementRecordVo>> {
    return this.settlementService.list(query)
  }

  /* ==========================================================================
   * 三、提现工作台（T4.33）
   * ========================================================================== */

  /**
   * 提现工作台分页
   */
  @Get('withdrawals')
  @ApiOperation({ summary: '提现工作台分页（状态/主体筛选）' })
  @ApiSwaggerResponse({ status: 200 })
  listWithdraws(@Query() query: QueryWithdrawDto): Promise<PageResult<WithdrawVo>> {
    return this.withdrawService.listAdmin(query)
  }

  /**
   * 提现详情
   */
  @Get('withdrawals/:id')
  @ApiOperation({ summary: '提现详情' })
  @ApiParam({ name: 'id', description: '提现 ID' })
  @ApiSwaggerResponse({ status: 200 })
  withdrawDetail(@Param('id') id: string): Promise<WithdrawVo> {
    return this.withdrawService.detail(id)
  }

  /**
   * 提现审核（pass / reject）
   */
  @Post('withdrawals/:id/audit')
  @ApiOperation({
    summary: '提现审核（通过/驳回）',
    description: 'pass → status=3 打款中（待 payout）；reject → status=2 + 解冻'
  })
  @ApiParam({ name: 'id', description: '提现 ID' })
  @ApiSwaggerResponse({ status: 200 })
  auditWithdraw(
    @CurrentUser('uid') opAdminId: string,
    @Param('id') id: string,
    @Body() dto: AuditWithdrawDto
  ): Promise<WithdrawVo> {
    return this.withdrawService.audit(id, dto, opAdminId)
  }

  /**
   * 提现打款（mock 模式直接 status=4）
   */
  @Post('withdrawals/:id/payout')
  @ApiOperation({
    summary: '触发打款（mock 模式直接置 status=4 已打款 + frozen 消减 + 写流水）'
  })
  @ApiParam({ name: 'id', description: '提现 ID' })
  @ApiSwaggerResponse({ status: 200 })
  payoutWithdraw(
    @CurrentUser('uid') opAdminId: string,
    @Param('id') id: string
  ): Promise<WithdrawVo> {
    return this.withdrawService.payout(id, opAdminId)
  }

  /* ==========================================================================
   * 四、发票工作台（T4.34）
   * ========================================================================== */

  /**
   * 发票工作台分页
   */
  @Get('invoices')
  @ApiOperation({ summary: '发票工作台分页' })
  @ApiSwaggerResponse({ status: 200 })
  listInvoices(@Query() query: QueryInvoiceDto): Promise<PageResult<InvoiceVo>> {
    return this.invoiceService.listAdmin(query)
  }

  /**
   * 发票详情
   */
  @Get('invoices/:id')
  @ApiOperation({ summary: '发票详情' })
  @ApiParam({ name: 'id', description: '发票 ID' })
  @ApiSwaggerResponse({ status: 200 })
  invoiceDetail(@Param('id') id: string): Promise<InvoiceVo> {
    return this.invoiceService.detail(id)
  }

  /**
   * 发票审核（pass → 1 开票中 / reject → 3 失败）
   */
  @Post('invoices/:id/audit')
  @ApiOperation({ summary: '发票审核（通过/驳回）' })
  @ApiParam({ name: 'id', description: '发票 ID' })
  @ApiSwaggerResponse({ status: 200 })
  auditInvoice(
    @CurrentUser('uid') opAdminId: string,
    @Param('id') id: string,
    @Body() dto: AuditInvoiceDto
  ): Promise<InvoiceVo> {
    return this.invoiceService.audit(id, dto, opAdminId)
  }

  /**
   * 开票（mock 生成 PDF + 邮件通知）
   */
  @Post('invoices/:id/issue')
  @ApiOperation({
    summary: '开票（mock：生成 PDF URL + e_invoice_no + 异步邮件）'
  })
  @ApiParam({ name: 'id', description: '发票 ID' })
  @ApiSwaggerResponse({ status: 200 })
  issueInvoice(
    @CurrentUser('uid') opAdminId: string,
    @Param('id') id: string,
    @Body() dto: IssueInvoiceDto
  ): Promise<InvoiceVo> {
    return this.invoiceService.issue(id, dto, opAdminId)
  }

  /* ==========================================================================
   * 五、对账差异报表（T4.35）—— Excel 直出下载
   * ========================================================================== */

  /**
   * 对账差异报表（Excel 下载）
   *
   * 入参：query.billDate（yyyyMMdd 或 yyyy-MM-dd）
   * 输出：res.attachment + xlsx 二进制
   */
  @Get('reconciliation-report')
  @ApiOperation({ summary: '对账差异报表 Excel 下载（按账单日）' })
  @ApiQuery({ name: 'billDate', required: true, example: '20260418' })
  @ApiSwaggerResponse({ status: 200, description: 'application/vnd.openxmlformats Excel 二进制' })
  async reconciliationReport(@Query() query: ReportQueryDto, @Res() res: Response): Promise<void> {
    const report = await this.reportService.generateReport(query.billDate)
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader('X-Report-Rows', String(report.rowCount))
    res.setHeader('X-Bill-Date', report.billDate)
    res.attachment(report.filename)
    res.send(report.buffer)
  }

  /* ==========================================================================
   * 六、人工调账（biz_type=8）
   * ========================================================================== */

  /**
   * 人工调账（biz_type=8）
   *
   * 入参：accountId / direction(1/2) / amount / remark / relatedNo?
   * 操作：余额加/减 + 写 account_flow biz_type=8 + 写 OperationLog
   */
  @Post('accounts/:accountId/adjust')
  @ApiOperation({
    summary: '人工调账（biz_type=8）',
    description: '管理员补偿/纠正账户余额；direction=1 加 / 2 减；service 自动写 OperationLog'
  })
  @ApiParam({ name: 'accountId', description: '账户 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async adjustBalance(
    @CurrentUser('uid') opAdminId: string,
    @Param('accountId') accountId: string,
    @Body() dto: AdjustBalanceDto
  ): Promise<{ account: AccountVo; flow: FlowVo }> {
    const result = await this.accountService.adjust(accountId, dto.direction, dto.amount, {
      relatedNo: dto.relatedNo ?? null,
      remark: dto.remark,
      opAdminId
    })
    return {
      account: this.accountService.toVo(result.account),
      flow: this.accountService.flowToVo(result.flow)
    }
  }

  /**
   * 账户详情（管理端）
   */
  @Get('accounts/:accountId')
  @ApiOperation({ summary: '账户详情（管理端）' })
  @ApiParam({ name: 'accountId', description: '账户 ID' })
  @ApiSwaggerResponse({ status: 200 })
  async adminAccountDetail(@Param('accountId') accountId: string): Promise<AccountVo> {
    const acc = await this.accountService.findById(accountId)
    return this.accountService.toVo(acc)
  }
}
