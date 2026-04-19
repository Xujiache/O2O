/**
 * @file finance.module.ts
 * @stage P4/T4.30~T4.35（Sprint 5 整合）
 * @desc 财务模块装配：账户 + 分账 + 提现 + 发票 + 对账差异报表
 * @author 单 Agent V2.0
 *
 * Controllers (4)：
 *   - MerchantFinanceController  /merchant/finance + /merchant/withdrawals + /merchant/invoices
 *   - RiderFinanceController     /rider/finance + /rider/withdrawals
 *   - UserFinanceController      /me/wallet + /me/invoices
 *   - AdminFinanceController     /admin/settlement-rules + /admin/settlement/run-once +
 *                                /admin/withdrawals + /admin/invoices +
 *                                /admin/reconciliation-report + /admin/accounts/{id}/adjust
 *
 * Providers (7)：
 *   - AccountService                 T4.30 账户 + 5 类操作 + 乐观锁 CAS
 *   - SettlementRuleService          T4.31 规则 CRUD + matchRule
 *   - SettlementService              T4.32 computeForOrder / execute / runForOrder + 跨表订单扫描
 *   - SettlementCronService          T4.32 @Cron 02:00 daily + runForDate（手工补跑）
 *   - WithdrawService                T4.33 申请 / 审核 / 打款 / 通知 4 阶段
 *   - InvoiceService                 T4.34 申请 / 审核 / 开票 / 邮件
 *   - ReconciliationReportService    T4.35 Excel 导出（exceljs）
 *
 * Imports：
 *   - HealthModule（REDIS_CLIENT；本期未直接使用，预留 Sprint 8 缓存改造）
 *   - UserModule（OperationLogService；管理端审核 / 打款 / 调账 全部入操作日志）
 *   - MessageModule（提现成功 / 开票成功通知；模板缺失走 best-effort）
 *   - FileModule（发票 PDF / 对账 Excel 上传；本期不写 OSS，仅引入以便后续切换）
 *   - ScheduleModule.forRoot()（本期 SettlementCronService @Cron 装饰器依赖）
 *   - TypeOrmModule.forFeature(D5 7 实体 - 不含只读 PaymentRecord/RefundRecord)
 *
 * Exports：
 *   - AccountService    供 PaymentModule（Sprint 4 已落地的 Subagent 3 范围）
 *                       / OrchestrationModule（Sprint 8 退款反向分账）注入
 *   - SettlementService 供 OrchestrationModule（OrderFinished 事件即时分账触发）
 *   - WithdrawService / InvoiceService 暂不外露
 *
 * 不修改：
 *   - entities/index.ts
 *   - database/database.module.ts
 *   - 其他业务模块（payment / order / dispatch / review）
 */

import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  Account,
  AccountFlow,
  Invoice,
  Reconciliation,
  SettlementRecord,
  SettlementRule,
  WithdrawRecord
} from '@/entities'
import { HealthModule } from '@/health/health.module'
import { FileModule } from '@/modules/file/file.module'
import { MessageModule } from '@/modules/message/message.module'
import { UserModule } from '@/modules/user/user.module'
import { AdminFinanceController } from './controllers/admin-finance.controller'
import { MerchantFinanceController } from './controllers/merchant-finance.controller'
import { RiderFinanceController } from './controllers/rider-finance.controller'
import { UserFinanceController } from './controllers/user-finance.controller'
import { AccountService } from './services/account.service'
import { InvoiceService } from './services/invoice.service'
import { ReconciliationReportService } from './services/reconciliation-report.service'
import { SettlementCronService } from './services/settlement-cron.service'
import { SettlementRuleService } from './services/settlement-rule.service'
import { SettlementService } from './services/settlement.service'
import { WithdrawService } from './services/withdraw.service'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HealthModule,
    UserModule,
    MessageModule,
    FileModule,
    TypeOrmModule.forFeature([
      Account,
      AccountFlow,
      SettlementRule,
      SettlementRecord,
      WithdrawRecord,
      Invoice,
      Reconciliation
    ])
  ],
  controllers: [
    MerchantFinanceController,
    RiderFinanceController,
    UserFinanceController,
    AdminFinanceController
  ],
  providers: [
    AccountService,
    SettlementRuleService,
    SettlementService,
    SettlementCronService,
    WithdrawService,
    InvoiceService,
    ReconciliationReportService
  ],
  exports: [AccountService, SettlementService, SettlementRuleService]
})
export class FinanceModule {}
