import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type Redis from 'ioredis'
import { BizErrorCode, BusinessException } from '@/common'
import { REDIS_CLIENT } from '@/health/redis.provider'
import { isLngLatValid } from './geo.util'
import {
  RIDER_LOCATION_PUBLISHER,
  type RiderLocationPublisher
} from './rabbitmq/rider-location.publisher'
import {
  type RiderLocationItemDto,
  type RiderReportDto,
  type RiderReportResultDto
} from './dto/map.dto'

/**
 * 一条待批量写 TimescaleDB 的位置记录
 *
 * 用途：rider-location.consumer 反序列化后批量 INSERT
 */
export interface RiderLocationPayload {
  riderId: string
  cityCode: string
  ts: number
  lng: number
  lat: number
  speedKmh: number | null
  direction: number | null
  accuracy: number | null
  battery: number | null
  orderNo: string | null
  tenantId: number
}

/**
 * 骑手位置上报服务（DESIGN_P3 §6.2）
 *
 * 设计：
 * - 同步：写 Redis Hash `rider:loc:{riderId}` (60s TTL) + Redis GEO `rider:online:{cityCode}`
 * - 异步：投递 RabbitMQ 队列 `rider.location`，由 consumer 批量写 TimescaleDB
 * - 严禁同步直写 TimescaleDB；上报接口 P95 ≤ 50ms
 *
 * 用途：MapController.report 调用 reportBatch
 */
@Injectable()
export class RiderLocationService {
  private readonly logger = new Logger(RiderLocationService.name)
  private readonly tenantId: number = 1

  /**
   * 构造服务
   * @param redis              ioredis 客户端（A 在 health 模块提供 REDIS_CLIENT）
   * @param publisher          rider-location MQ Publisher
   * @param config             读取 batch 与 flush 配置
   */
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(RIDER_LOCATION_PUBLISHER) private readonly publisher: RiderLocationPublisher,
    private readonly config: ConfigService
  ) {}

  /**
   * 批量上报
   * 参数：dto RiderReportDto
   * 返回值：RiderReportResultDto
   * 错误：MAP_PROVIDER_ERROR + 400 当 lng/lat 越界
   */
  async reportBatch(dto: RiderReportDto): Promise<RiderReportResultDto> {
    const accepted = dto.locations.filter((p) => isLngLatValid(p.lng, p.lat))
    if (accepted.length === 0) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        '位置参数全部非法',
        HttpStatus.BAD_REQUEST
      )
    }
    // 取最近一条作为最新位置（按 ts 升序）
    const latest = [...accepted].sort((a, b) => a.ts - b.ts).at(-1)!
    const geoUpdated = await this.updateRedis(dto.riderId, dto.cityCode, latest)
    const batchId = `rider-loc-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    const payloads: RiderLocationPayload[] = accepted.map((p) =>
      this.toPayload(dto.riderId, dto.cityCode, p)
    )
    try {
      await this.publisher.publishBatch(payloads, batchId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`MQ 投递失败 ${batchId}：${msg}`)
      throw new BusinessException(
        BizErrorCode.SYSTEM_MQ_ERROR,
        `骑手位置 MQ 投递失败：${msg}`,
        HttpStatus.BAD_GATEWAY
      )
    }
    return { accepted: accepted.length, geoUpdated, batchId }
  }

  /**
   * 写 Redis 最新位置 Hash + GEO
   *
   * Key 规划（与 redis-keys.md K21/K22 对齐）：
   *  - `rider:loc:{riderId}`         Hash，TTL 60s
   *  - `rider:online:{cityCode}`     GEO，无 TTL（依赖业务上下线维护）
   *
   * 参数：riderId / cityCode / 最新点
   * 返回值：true 当 GEO + Hash 都成功；false 当任一失败（不抛错，避免影响上报主流程）
   */
  private async updateRedis(
    riderId: string,
    cityCode: string,
    latest: RiderLocationItemDto
  ): Promise<boolean> {
    try {
      const hashKey = `rider:loc:${riderId}`
      const geoKey = `rider:online:${cityCode}`
      const pipeline = this.redis.multi()
      pipeline.hset(hashKey, {
        lng: String(latest.lng),
        lat: String(latest.lat),
        ts: String(latest.ts),
        speedKmh: latest.speedKmh != null ? String(latest.speedKmh) : '',
        dir: latest.dir != null ? String(latest.dir) : '',
        battery: latest.battery != null ? String(latest.battery) : '',
        orderNo: latest.orderNo ?? ''
      })
      pipeline.expire(hashKey, 60)
      pipeline.geoadd(geoKey, latest.lng, latest.lat, riderId)
      const results = await pipeline.exec()
      return Array.isArray(results) && results.every(([err]) => err == null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Redis GEO 更新失败 rider=${riderId} city=${cityCode}：${msg}`)
      return false
    }
  }

  /**
   * 单条 DTO → 持久化 payload
   * 参数：riderId / cityCode / item
   * 返回值：RiderLocationPayload
   */
  private toPayload(
    riderId: string,
    cityCode: string,
    item: RiderLocationItemDto
  ): RiderLocationPayload {
    return {
      riderId,
      cityCode,
      ts: item.ts,
      lng: item.lng,
      lat: item.lat,
      speedKmh: item.speedKmh ?? null,
      direction: item.dir ?? null,
      accuracy: item.acc ?? null,
      battery: item.battery ?? null,
      orderNo: item.orderNo ?? null,
      tenantId: this.tenantId
    }
  }

  /**
   * GEO 半径搜索（业务模块如派单、附近骑手 用）
   *
   * 参数：cityCode；center [lng,lat]；radiusKm；count
   * 返回值：[{ riderId, lng, lat, distanceKm }]
   * 用途：DispatchService（P4）调用；本期暴露给单测
   */
  async searchOnlineRiders(
    cityCode: string,
    centerLng: number,
    centerLat: number,
    radiusKm: number,
    count = 50
  ): Promise<Array<{ riderId: string; lng: number; lat: number; distanceKm: number }>> {
    const geoKey = `rider:online:${cityCode}`
    try {
      const result = (await this.redis.geosearch(
        geoKey,
        'FROMLONLAT',
        centerLng,
        centerLat,
        'BYRADIUS',
        radiusKm,
        'km',
        'ASC',
        'COUNT',
        count,
        'WITHCOORD',
        'WITHDIST'
      )) as Array<[string, string, [string, string]]>
      return result.map(([riderId, dist, coord]) => ({
        riderId,
        distanceKm: Number(dist),
        lng: Number(coord[0]),
        lat: Number(coord[1])
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`GEOSEARCH 失败 city=${cityCode}：${msg}`)
      return []
    }
  }
}
