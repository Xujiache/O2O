/**
 * @file user.module.ts
 * @stage P3 / T3.9~T3.12
 * @desc 用户中心模块（C 端 + 商户 + 骑手 + 管理员 + 黑名单 + 资质 + 操作日志）
 * @author 员工 B
 *
 * 5 个 Controller：UserController / AddressController / MerchantController /
 *                  RiderController / AdminController
 * 7 个 Service：UserService / AddressService / MerchantService / RiderService /
 *               AdminService / BlacklistService / QualificationService（+ 内部 OperationLogService）
 *
 * 依赖：
 *   - HealthModule（REDIS_CLIENT）
 *   - AuthModule（JwtAuthGuard / UserTypeGuard / PermissionGuard，已在 AuthModule 内 export 并标记 @Global）
 *   - TypeOrmModule.forFeature 实体清单：14 D1 entity（除 MerchantStaff 本期未直用，仍声明便于后续扩展）+ OperationLog
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
  User,
  UserAddress
} from '../../entities'
import { HealthModule } from '../../health/health.module'
import { AdminController } from './controllers/admin.controller'
import { AddressController } from './controllers/address.controller'
import { MerchantController } from './controllers/merchant.controller'
import { RiderController } from './controllers/rider.controller'
import { UserController } from './controllers/user.controller'
import { AddressService } from './services/address.service'
import { AdminService } from './services/admin.service'
import { BlacklistService } from './services/blacklist.service'
import { MerchantService } from './services/merchant.service'
import { OperationLogService } from './services/operation-log.service'
import { QualificationService } from './services/qualification.service'
import { RiderService } from './services/rider.service'
import { UserService } from './services/user.service'

@Module({
  imports: [
    HealthModule,
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
      OperationLog
    ])
  ],
  controllers: [
    UserController,
    AddressController,
    MerchantController,
    RiderController,
    AdminController
  ],
  providers: [
    UserService,
    AddressService,
    MerchantService,
    QualificationService,
    RiderService,
    AdminService,
    BlacklistService,
    OperationLogService
  ],
  exports: [
    UserService,
    AddressService,
    MerchantService,
    QualificationService,
    RiderService,
    AdminService,
    BlacklistService,
    OperationLogService
  ]
})
export class UserModule {}
