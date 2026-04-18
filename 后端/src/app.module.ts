import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import configuration from './config/configuration'
import { envValidationSchema } from './config/env.validation'
import { AllExceptionsFilter, LoggingInterceptor, TransformInterceptor } from './common'
import { DatabaseModule } from './database/database.module'
import { QueuesModule } from './queues/queues.module'
import { HealthModule } from './health/health.module'
// ========== 业务模块（P3~P4 阶段逐步填充实现，P1 仅保留占位 Module） ==========
import { AuthModule } from './modules/auth/auth.module'
import { UserModule } from './modules/user/user.module'
import { MessageModule } from './modules/message/message.module'
import { FileModule } from './modules/file/file.module'
import { MapModule } from './modules/map/map.module'
import { OrderModule } from './modules/order/order.module'
import { ProductModule } from './modules/product/product.module'
import { ShopModule } from './modules/shop/shop.module'
import { DispatchModule } from './modules/dispatch/dispatch.module'
import { PaymentModule } from './modules/payment/payment.module'
import { FinanceModule } from './modules/finance/finance.module'
import { MarketingModule } from './modules/marketing/marketing.module'
import { ReviewModule } from './modules/review/review.module'
import { AdminModule } from './modules/admin/admin.module'
import { StatsModule } from './modules/stats/stats.module'
import { CustomerModule } from './modules/customer/customer.module'

/**
 * 根模块
 * 功能：聚合基础设施（Config/DB/Queue/Health）与 16 个业务模块占位
 * 参数：无
 * 返回值：AppModule
 * 用途：main.ts 中 NestFactory.create(AppModule)
 */
@Module({
  imports: [
    // ===== 配置中心 =====
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env']
    }),
    // ===== 基础设施 =====
    DatabaseModule,
    QueuesModule,
    HealthModule,
    // ===== 业务模块（16 个业务占位，对齐 PRD §3.5 + §3.4） =====
    AuthModule,
    UserModule,
    MessageModule,
    FileModule,
    MapModule,
    OrderModule,
    ProductModule,
    ShopModule,
    DispatchModule,
    PaymentModule,
    FinanceModule,
    MarketingModule,
    ReviewModule,
    AdminModule,
    StatsModule,
    CustomerModule
  ],
  providers: [
    // 全局异常过滤器：统一响应格式
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 全局拦截器：请求日志
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // 全局拦截器：响应体包装为 { code, message, data, timestamp }
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor }
  ]
})
export class AppModule {}
