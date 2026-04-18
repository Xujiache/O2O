import { Module, type FactoryProvider } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { HealthModule } from '@/health/health.module'
import { RiderLocationConsumer } from './consumer/rider-location.consumer'
import { MapController } from './map.controller'
import { MapService } from './map.service'
import { AmapProvider } from './providers/amap.provider'
import { RiderLocationService } from './rider-location.service'
import {
  AmqpRiderLocationPublisher,
  InMemoryRiderLocationPublisher,
  RIDER_LOCATION_PUBLISHER,
  type RiderLocationPublisher
} from './rabbitmq/rider-location.publisher'
import { timescalePoolProvider } from './timescale/timescale.provider'

/**
 * RIDER_LOCATION_PUBLISHER Provider
 *
 * 设计：
 * - RABBITMQ_URL 非空 → 真正连 amqplib（生产路径）
 * - RABBITMQ_URL 空 → InMemory 兜底（本机自验证 / 单元测试）
 * - 切换运行时无侵入业务代码：业务始终注入 RIDER_LOCATION_PUBLISHER 接口
 *
 * 用途：MapModule 内部使用
 */
const riderLocationPublisherProvider: FactoryProvider<RiderLocationPublisher> = {
  provide: RIDER_LOCATION_PUBLISHER,
  useFactory: (config: ConfigService): RiderLocationPublisher => {
    const url = config.get<string>('rabbitmq.url', '')
    if (url) return new AmqpRiderLocationPublisher(config)
    return new InMemoryRiderLocationPublisher()
  },
  inject: [ConfigService]
}

/**
 * 地图与定位模块（DESIGN_P3 §六）
 *
 * 用途：
 * - 注册 7 个对外接口（geocode / regeocode / distance / routing / within-area / rider/report / rider/:id/track/:orderNo）
 *   + 1 个内部接口（shop-area 缓存预热）
 * - 启动 RiderLocationConsumer，从 RabbitMQ 批量消费 → TimescaleDB
 * - 业务模块 import MapModule 后可注入 MapService / RiderLocationService
 *
 * 依赖：
 * - REDIS_CLIENT（来自 HealthModule）
 * - DataSource（默认 MySQL，TypeORM 注入）
 * - TIMESCALE_POOL（本模块自建，独立 PostgreSQL）
 * - RIDER_LOCATION_PUBLISHER（本模块自建）
 */
@Module({
  imports: [ConfigModule, HealthModule],
  controllers: [MapController],
  providers: [
    AmapProvider,
    MapService,
    RiderLocationService,
    riderLocationPublisherProvider,
    timescalePoolProvider,
    RiderLocationConsumer
  ],
  exports: [MapService, RiderLocationService, RIDER_LOCATION_PUBLISHER]
})
export class MapModule {}
