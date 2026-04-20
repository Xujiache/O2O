import { Controller, Get, Inject } from '@nestjs/common'
import { Public } from '../modules/auth/decorators/public.decorator'
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  TypeOrmHealthIndicator
} from '@nestjs/terminus'
import { ApiTags } from '@nestjs/swagger'
import Redis from 'ioredis'
import { REDIS_CLIENT } from './redis.provider'

/**
 * 健康检查控制器
 * 功能：暴露 /health 端点，返回 db/redis 等下游依赖状态
 * 参数：health 健康检查服务、db TypeORM 探针、redis 单例 Redis 客户端（I-10）
 * 返回值：{ status, info, error, details }（Terminus 标准格式）
 * 用途：K8s / Prometheus / uptime 监控探活；对齐 DESIGN_P1 §4.3 & ACCEPTANCE V1.8
 */
@ApiTags('系统')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /**
   * 聚合健康检查
   * 功能：按顺序 ping 数据库与 Redis，任一失败则整体 status=error
   * 参数：无（由 Terminus @HealthCheck() 装饰器在 HTTP 层驱动）
   * 返回值：Promise<HealthCheckResult>
   *         形如 { status: 'ok'|'error', info: {...}, error: {...}, details: {...} }
   * 用途：GET /health 被 K8s liveness/readiness 与 Docker HEALTHCHECK 调用；
   *       对齐 DESIGN_P1 §4.3 与 ACCEPTANCE_P1 V1.8（I-05 补齐函数级注释）
   */
  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1500 }),
      () => this.pingRedis('redis')
    ])
  }

  /**
   * Redis 存活检查
   * 功能：复用 DI 容器中的单例 Redis 客户端发一次 PING（I-10 修复）
   * 参数：key 探针 key 名
   * 返回值：HealthIndicatorResult { [key]: { status, message? } }
   * 用途：被 HealthCheckService 聚合
   */
  private async pingRedis(key: string): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.redis.ping()
      return { [key]: { status: pong === 'PONG' ? 'up' : 'down' } }
    } catch (err) {
      return {
        [key]: {
          status: 'down',
          message: err instanceof Error ? err.message : String(err)
        }
      }
    }
  }
}
