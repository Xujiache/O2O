import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import { HealthModule } from '@/health/health.module'
import { OrderShardJob } from './jobs/order-shard-job'
import {
  D1_ENTITIES,
  D2_REGION_ENTITIES,
  D3_SHOP_PRODUCT_ENTITIES,
  D4_ORDER_GLOBAL_ENTITIES,
  D5_FINANCE_ENTITIES,
  D6_DISPATCH_ENTITIES,
  D7_MARKETING_ENTITIES,
  D8_REVIEW_ENTITIES,
  D9_MESSAGE_ENTITIES,
  D10_SYSTEM_ENTITIES
} from '@/entities'

/**
 * 数据库模块
 * 功能：基于 @nestjs/typeorm + mysql2，读取 config.db.* 异步初始化数据源
 * 参数：无
 * 返回值：DatabaseModule（Nest 模块）
 * 用途：app.module.ts 根模块 imports；
 *      业务模块通过 TypeOrmModule.forFeature([Entity]) 注册子集即可访问；
 *      P3/T3.3：D1 账号域 14 个 Entity 已注册到 entities 数组（autoLoadEntities 兜底）
 */
@Module({
  imports: [
    HealthModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('db.host'),
        port: config.get<number>('db.port'),
        username: config.get<string>('db.username'),
        password: config.get<string>('db.password'),
        database: config.get<string>('db.database'),
        synchronize: config.get<boolean>('db.synchronize'),
        logging: config.get<boolean>('db.logging'),
        timezone: '+08:00',
        charset: 'utf8mb4',
        entities: [
          ...D1_ENTITIES,
          ...D10_SYSTEM_ENTITIES,
          ...D9_MESSAGE_ENTITIES,
          ...D2_REGION_ENTITIES,
          ...D3_SHOP_PRODUCT_ENTITIES,
          ...D7_MARKETING_ENTITIES,
          ...D4_ORDER_GLOBAL_ENTITIES,
          ...D5_FINANCE_ENTITIES,
          ...D6_DISPATCH_ENTITIES,
          ...D8_REVIEW_ENTITIES
        ],
        autoLoadEntities: true
      })
    })
  ],
  providers: [OrderShardJob]
})
export class DatabaseModule {}
