import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule, ConfigService } from '@nestjs/config'

/**
 * 队列模块（BullMQ + Redis）
 * 功能：按 DESIGN_P1 §4 注册 BullMQ 全局连接，P3+ 各业务模块通过 BullModule.registerQueue 注册队列
 * 参数：无
 * 返回值：QueuesModule
 * 用途：订单异步处理、消息推送、分账结算、日志上报等异步任务（PRD §3.5.3 消息队列服务）
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password') || undefined,
          db: config.get<number>('redis.db')
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86400 }
        }
      })
    })
  ],
  exports: [BullModule]
})
export class QueuesModule {}
