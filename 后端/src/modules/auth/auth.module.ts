/**
 * @file auth.module.ts
 * @stage P3/T3.4 ~ T3.7
 * @desc 统一认证授权模块
 * @author 员工 A
 *
 * 模块组成：
 *   - controllers: AuthController（9 个 HTTP 接口）
 *   - providers:
 *       AuthService（核心：登录 / token / 风控 / sms）
 *       JwtStrategy（passport-jwt HS512 + ver 校验）
 *       WxMpStrategy（jscode2session 包装）
 *       JwtAuthGuard / UserTypeGuard / PermissionGuard / ThrottleSignGuard
 *   - imports:
 *       PassportModule
 *       JwtModule.registerAsync (HS512 + JWT_SECRET)
 *       TypeOrmModule.forFeature(D1 7 个 Entity)
 *       HealthModule（共享 REDIS_CLIENT）
 *
 * 全局：@Global() —— user/file/map 等业务模块直接 @UseGuards(JwtAuthGuard)
 */

import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  Admin,
  AdminRole,
  Blacklist,
  Merchant,
  MerchantStaff,
  Permission,
  Rider,
  RolePermission,
  User
} from '../../entities'
import { HealthModule } from '../../health/health.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AdminPubkeyController } from './controllers/admin-pubkey.controller'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { PermissionGuard } from './guards/permission.guard'
import { ThrottleSignGuard } from './guards/throttle-sign.guard'
import { UserTypeGuard } from './guards/user-type.guard'
import { RsaKeyService } from './services/rsa-key.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import { WxMpStrategy } from './strategies/wx-mp.strategy'

@Global()
@Module({
  imports: [
    HealthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          algorithm: 'HS512',
          expiresIn: config.get<number>('jwt.expiresIn') ?? 7200
        }
      })
    }),
    TypeOrmModule.forFeature([
      User,
      Merchant,
      MerchantStaff,
      Rider,
      Admin,
      AdminRole,
      RolePermission,
      Permission,
      Blacklist
    ])
  ],
  controllers: [AuthController, AdminPubkeyController],
  providers: [
    AuthService,
    JwtStrategy,
    WxMpStrategy,
    JwtAuthGuard,
    UserTypeGuard,
    PermissionGuard,
    ThrottleSignGuard,
    RsaKeyService
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    UserTypeGuard,
    PermissionGuard,
    ThrottleSignGuard,
    RsaKeyService
  ]
})
export class AuthModule {}
