import type { FactoryProvider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis, { type RedisOptions } from 'ioredis'

/**
 * Redis 客户端注入 Token
 * 功能：统一的 Provider 标识，供 @Inject(REDIS_CLIENT) 注入
 * 参数：无
 * 返回值：symbol 类型的唯一 Token
 * 用途：HealthController / 业务服务注入同一个 ioredis 单例
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT')

/**
 * Redis 单例连接 Provider 工厂
 * 功能：基于 @nestjs/config 读取 redis.host/port/password/db，构造一个
 *       lazyConnect + 短超时的 ioredis 实例，整个进程生命周期内复用，避免
 *       每次健康检查都新建/关闭连接（I-10 修复根因）
 * 参数：config ConfigService（由 Nest 依赖注入提供）
 * 返回值：Redis ioredis 单例客户端
 * 用途：HealthModule 注册；后续 P3 阶段若有 cache/queue 以外的场景可复用
 */
const redisClientFactory = async (config: ConfigService): Promise<Redis> => {
  const options: RedisOptions = {
    host: config.get<string>('redis.host'),
    port: config.get<number>('redis.port'),
    password: config.get<string>('redis.password') || undefined,
    db: config.get<number>('redis.db'),
    lazyConnect: true,
    connectTimeout: 1500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  }
  const client = new Redis(options)
  // 尝试建立连接；失败不抛出，由健康检查在 ping 时感知
  try {
    await client.connect()
  } catch {
    /* noop：health check 阶段再反映状态 */
  }
  return client
}

/**
 * REDIS_CLIENT Provider
 * 功能：把 redisClientFactory 注册为 Nest DI 容器中的异步工厂 Provider
 * 参数：无
 * 返回值：FactoryProvider 配置对象
 * 用途：在 HealthModule.providers 中展开使用
 */
export const redisClientProvider: FactoryProvider<Promise<Redis>> = {
  provide: REDIS_CLIENT,
  useFactory: redisClientFactory,
  inject: [ConfigService]
}
