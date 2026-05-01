import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  Admin,
  AdminRole,
  ApiLog,
  Arbitration,
  Complaint,
  DlqRetryLog,
  OperationLog,
  Permission,
  Role,
  RolePermission,
  Ticket
} from '@/entities'
import { SettlementRecord } from '@/entities/finance/settlement-record.entity'
import { AdminContentController } from './controllers/admin-content.controller'
import { AdminDashboardController } from './controllers/admin-dashboard.controller'
import { AdminDlqController } from './controllers/admin-dlq.controller'
import { AdminExportController } from './controllers/admin-export.controller'
import { AdminFinanceExtController } from './controllers/admin-finance-ext.controller'
import { AdminOpsController } from './controllers/admin-ops.controller'
import { AdminRiderExtController } from './controllers/admin-rider-ext.controller'
import { AdminRiskController } from './controllers/admin-risk.controller'
import { AdminSystemController } from './controllers/admin-system.controller'
import { OperationLogInterceptor } from './operation-log.interceptor'
import { OperationLogService } from './services/operation-log.service'
import { ADMIN_EXPORT_QUEUE, AdminExportService } from './services/admin-export.service'
import { AdminExportProcessor } from './processors/admin-export.processor'
import { AdminFinanceExtService } from './services/admin-finance-ext.service'
import { AdminRiderExtService } from './services/admin-rider-ext.service'
import { AdminDashboardService } from './services/admin-dashboard.service'
import { LogQueryService } from './services/log-query.service'
import {
  DlqRetryProcessor,
  ORCHESTRATION_DLQ_RETRY_QUEUE
} from '@/modules/orchestration/processors/dlq-retry.processor'
import { FinanceModule } from '@/modules/finance/finance.module'
import { FileModule } from '@/modules/file/file.module'
import { MapModule } from '@/modules/map/map.module'
import { UserModule } from '@/modules/user/user.module'
import { ReviewModule } from '@/modules/review/review.module'

/**
 * 管理后台聚合模块
 * 功能：对齐 PRD §3.4 平台管理后台，聚合运营/内容/大盘/导出/骑手扩展/财务扩展 API
 * 参数：无
 * 返回值：AdminModule
 * 用途：补齐 R1 修复报告中登记的 6 组 admin API 缺口
 *
 * P9 Sprint 3 / W3.D.1 增量：
 *   - 新增 OperationLogService（admin 域）+ OperationLogInterceptor 全局拦截器
 *   - APP_INTERCEPTOR 全局生效；拦截器内首行 path.startsWith('/admin') 过滤，
 *     非 admin 路径直接 next.handle() 不写日志，避免对其他模块产生噪音
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Admin,
      Role,
      Permission,
      AdminRole,
      RolePermission,
      OperationLog,
      Ticket,
      Arbitration,
      Complaint,
      DlqRetryLog,
      /* P9 Sprint 4 / W4.B.2：admin-finance-ext.service retrySettlement 需 SettlementRecord Repository */
      SettlementRecord,
      /* P9 Sprint 5 / W5.A.3：LogQueryService 查 api_log 真后端 */
      ApiLog
    ]),
    BullModule.registerQueue({ name: ORCHESTRATION_DLQ_RETRY_QUEUE }),
    /* P9 Sprint 4 / W4.B.1：admin-export 独立队列，concurrency=2 */
    BullModule.registerQueue({ name: ADMIN_EXPORT_QUEUE }),
    /* P9 Sprint 4 集成依赖 */
    FinanceModule /* SettlementService（admin-finance-ext.service） */,
    FileModule /* STORAGE_ADAPTER（admin-export.processor xlsx 上传 MinIO） */,
    MapModule /* MapService.queryTrack（admin-rider-ext.service track 端点） */,
    UserModule,
    ReviewModule
  ],
  controllers: [
    AdminContentController,
    AdminDashboardController,
    AdminDlqController,
    AdminExportController,
    AdminFinanceExtController,
    AdminOpsController,
    AdminRiderExtController,
    AdminSystemController,
    AdminRiskController
  ],
  providers: [
    OperationLogService,
    DlqRetryProcessor,
    /* P9 Sprint 4 业务 service + BullMQ Worker */
    AdminExportService,
    AdminExportProcessor,
    AdminFinanceExtService,
    AdminRiderExtService,
    AdminDashboardService,
    /* P9 Sprint 5 / W5.A.3：操作日志 / API 日志真后端查询 */
    LogQueryService,
    { provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor }
  ],
  exports: [OperationLogService]
})
export class AdminModule {}
