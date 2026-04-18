import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './health.controller'
import { redisClientProvider, REDIS_CLIENT } from './redis.provider'

/**
 * 健康检查模块
 * 功能：注册 @nestjs/terminus + HealthController + 单例 Redis Provider（I-10）
 * 参数：无
 * 返回值：HealthModule
 * 用途：app.module.ts 根模块 imports；export REDIS_CLIENT 以便后续业务模块复用
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [redisClientProvider],
  exports: [REDIS_CLIENT]
})
export class HealthModule {}
