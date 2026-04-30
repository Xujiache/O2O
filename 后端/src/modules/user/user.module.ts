/**
 * @file user.module.ts
 * @stage P3 / T3.9~T3.12
 * @desc 用户中心模块（C 端 + 商户 + 骑手 + 管理员 + 黑名单 + 资质 + 操作日志）
 * @author 员工 B
 *
 * 6 个 Controller：UserController / AddressController / MerchantController /
 *                  MerchantStaffController / RiderController / AdminController
 * 8 个 Service：UserService / AddressService / MerchantService / MerchantStaffService /
 *               RiderService / AdminService / BlacklistService / QualificationService
 *               （+ 内部 OperationLogService）
 *
 * 依赖：
 *   - HealthModule（REDIS_CLIENT）
 *   - AuthModule（JwtAuthGuard / UserTypeGuard / PermissionGuard，已在 AuthModule 内 export 并标记 @Global）
 *   - TypeOrmModule.forFeature 实体清单：14 D1 entity + Shop + OperationLog
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  Admin,
  AdminRole,
  Blacklist,
  Merchant,
  MerchantQualification,
  MerchantStaff,
  OperationLog,
  Permission,
  Rider,
  RiderDeposit,
  RiderQualification,
  Role,
  RolePermission,
  Shop,
  User,
  UserAddress
} from '../../entities'
import { HealthModule } from '../../health/health.module'
import { AdminController } from './controllers/admin.controller'
import { AddressController } from './controllers/address.controller'
import { MerchantController } from './controllers/merchant.controller'
import { MerchantStaffController } from './controllers/merchant-staff.controller'
import { RiderController } from './controllers/rider.controller'
import { UserController } from './controllers/user.controller'
import { MessageModule } from '../message/message.module'
import { HealthCertExpireJob } from './jobs/health-cert-expire.job'
import { AddressService } from './services/address.service'
import { AdminService } from './services/admin.service'
import { BlacklistService } from './services/blacklist.service'
import { MerchantStaffService } from './services/merchant-staff.service'
import { MerchantService } from './services/merchant.service'
import { OperationLogService } from './services/operation-log.service'
import { QualificationService } from './services/qualification.service'
import { RiderService } from './services/rider.service'
import { UserService } from './services/user.service'

@Module({
  imports: [
    HealthModule,
    /* P9 Sprint 2 / W2.B.3：HealthCertExpireJob 依赖 MessageService 推送 */
    MessageModule,
    TypeOrmModule.forFeature([
      User,
      UserAddress,
      Merchant,
      MerchantQualification,
      MerchantStaff,
      Rider,
      RiderQualification,
      RiderDeposit,
      Admin,
      Role,
      Permission,
      AdminRole,
      RolePermission,
      Blacklist,
      Shop,
      OperationLog
    ])
  ],
  controllers: [
    UserController,
    AddressController,
    MerchantController,
    MerchantStaffController,
    RiderController,
    AdminController
  ],
  providers: [
    UserService,
    AddressService,
    MerchantService,
    MerchantStaffService,
    QualificationService,
    RiderService,
    AdminService,
    BlacklistService,
    OperationLogService,
    /* P9 Sprint 2 / W2.B.3（P9-P1-12）：健康证到期 15 天前提醒 cron */
    HealthCertExpireJob
  ],
  exports: [
    UserService,
    AddressService,
    MerchantService,
    MerchantStaffService,
    QualificationService,
    RiderService,
    AdminService,
    BlacklistService,
    OperationLogService
  ]
})
export class UserModule {}
