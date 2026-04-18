import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { D1_ENTITIES, D10_SYSTEM_ENTITIES } from '@/entities'

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
        entities: [...D1_ENTITIES, ...D10_SYSTEM_ENTITIES],
        autoLoadEntities: true
      })
    })
  ]
})
export class DatabaseModule {}
