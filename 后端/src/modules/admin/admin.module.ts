import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  Admin,
  AdminRole,
  Arbitration,
  Complaint,
  OperationLog,
  Permission,
  Role,
  RolePermission,
  Ticket
} from '@/entities'
import { AdminContentController } from './controllers/admin-content.controller'
import { AdminDashboardController } from './controllers/admin-dashboard.controller'
import { AdminExportController } from './controllers/admin-export.controller'
import { AdminFinanceExtController } from './controllers/admin-finance-ext.controller'
import { AdminOpsController } from './controllers/admin-ops.controller'
import { AdminRiderExtController } from './controllers/admin-rider-ext.controller'
import { AdminRiskController } from './controllers/admin-risk.controller'
import { AdminSystemController } from './controllers/admin-system.controller'
import { UserModule } from '@/modules/user/user.module'
import { ReviewModule } from '@/modules/review/review.module'

/**
 * 管理后台聚合模块
 * 功能：对齐 PRD §3.4 平台管理后台，聚合运营/内容/大盘/导出/骑手扩展/财务扩展 API
 * 参数：无
 * 返回值：AdminModule
 * 用途：补齐 R1 修复报告中登记的 6 组 admin API 缺口
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
      Complaint
    ]),
    UserModule,
    ReviewModule
  ],
  controllers: [
    AdminContentController,
    AdminDashboardController,
    AdminExportController,
    AdminFinanceExtController,
    AdminOpsController,
    AdminRiderExtController,
    AdminSystemController,
    AdminRiskController
  ]
})
export class AdminModule {}
