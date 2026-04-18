import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { createHash } from 'crypto'
import type Redis from 'ioredis'
import { Pool } from 'pg'
import { DataSource } from 'typeorm'
import { BizErrorCode, BusinessException } from '@/common'
import { REDIS_CLIENT } from '@/health/redis.provider'
import {
  type DistanceResultDto,
  type GeocodeResultDto,
  type RegeocodeResultDto,
  type RoutingResultDto,
  type RoutingType,
  type SetShopAreaDto,
  type TrackResultDto,
  type WithinAreaDto,
  type WithinAreaResultDto
} from './dto/map.dto'
import { haversineDistanceM, isLngLatValid, isPointInPolygon, trackTotalLengthM } from './geo.util'
import { AmapProvider } from './providers/amap.provider'
import { TIMESCALE_POOL } from './timescale/timescale.provider'

/**
 * 高德缓存 TTL（秒，对齐 DESIGN §6.4）
 */
const CACHE_TTL = {
  geocode: 7 * 86400,
  regeocode: 1 * 86400,
  route: 30 * 60,
  shopArea: 5 * 60
} as const

/**
 * Map Service —— 5 个对外接口 + 配送范围 + 轨迹查询编排
 *
 * 设计：
 * - geocode/regeocode/distance/routing 走「Cache-Aside」策略：先查 Redis，miss 再调 Amap，
 *   成功后回写并设 TTL；缓存 key 严格按 DESIGN §6.4 命名
 * - 配送范围校验优先用 Redis polygon 缓存（business 主动 set），缓存 miss 则查 MySQL
 * - 轨迹查询直查 TimescaleDB；失败抛 BusinessException + 502
 *
 * 用途：MapController 5 个接口 + RiderController（P3 后续）通过本类下发缓存
 */
@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name)

  /**
   * 构造服务
   * @param redis           ioredis（缓存）
   * @param amap            高德 Provider
   * @param dataSource      MySQL DataSource（查 delivery_area）
   * @param tsPool          TimescaleDB pg.Pool
   * @param config          配置
   */
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly amap: AmapProvider,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(TIMESCALE_POOL) private readonly tsPool: Pool,
    private readonly config: ConfigService
  ) {}

  /**
   * 地理编码
   * 参数：address / city
   * 返回值：GeocodeResultDto
   */
  async geocode(address: string, city?: string): Promise<GeocodeResultDto> {
    const key = `geocode:${this.md5(`${address}|${city ?? ''}`)}`
    const cached = await this.safeGet<GeocodeResultDto>(key)
    if (cached) return cached
    const result = await this.amap.geocode(address, city)
    await this.safeSet(key, result, CACHE_TTL.geocode)
    return result
  }

  /**
   * 逆地理编码
   * 参数：lng / lat
   * 返回值：RegeocodeResultDto
   */
  async regeocode(lng: number, lat: number): Promise<RegeocodeResultDto> {
    if (!isLngLatValid(lng, lat)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'lng/lat 越界',
        HttpStatus.BAD_REQUEST
      )
    }
    const lngR = Number(lng.toFixed(5))
    const latR = Number(lat.toFixed(5))
    const key = `regeocode:${lngR},${latR}`
    const cached = await this.safeGet<RegeocodeResultDto>(key)
    if (cached) return cached
    const result = await this.amap.regeocode(lngR, latR)
    await this.safeSet(key, result, CACHE_TTL.regeocode)
    return result
  }

  /**
   * 距离计算（type=0 直线本地算 + 不调高德；其他走高德）
   * 参数：fromLng/fromLat/toLng/toLat/type
   * 返回值：DistanceResultDto
   */
  async distance(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
    type: '0' | '1' | '3' = '0'
  ): Promise<DistanceResultDto> {
    if (
      ![fromLng, fromLat, toLng, toLat].every((v) => typeof v === 'number' && Number.isFinite(v))
    ) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        '坐标参数非法',
        HttpStatus.BAD_REQUEST
      )
    }
    if (type === '0') {
      return {
        distance: Math.round(haversineDistanceM(fromLng, fromLat, toLng, toLat)),
        duration: 0,
        type: 'line'
      }
    }
    return this.amap.distance(fromLng, fromLat, toLng, toLat, type)
  }

  /**
   * 路径规划（含缓存）
   * 参数：起点 / 终点 / type
   * 返回值：RoutingResultDto
   */
  async routing(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
    type: RoutingType
  ): Promise<RoutingResultDto> {
    const key = `route:${fromLng.toFixed(5)},${fromLat.toFixed(5)}:${toLng.toFixed(5)},${toLat.toFixed(5)}:${type}`
    const cached = await this.safeGet<RoutingResultDto>(key)
    if (cached) return cached
    const result = await this.amap.routing(fromLng, fromLat, toLng, toLat, type)
    await this.safeSet(key, result, CACHE_TTL.route)
    return result
  }

  /**
   * 配送范围校验
   *
   * 流程：
   * 1) 取 Redis `shop:deliveryArea:{shopId}`（polygon JSON + 配送费 / 起送价）
   * 2) miss → 查 MySQL delivery_area（area_type=1, owner_id=shopId, status=1）
   * 3) 应用 turf.booleanPointInPolygon
   *
   * 参数：dto WithinAreaDto
   * 返回值：WithinAreaResultDto
   */
  async withinArea(dto: WithinAreaDto): Promise<WithinAreaResultDto> {
    if (!isLngLatValid(dto.lng, dto.lat)) {
      throw new BusinessException(
        BizErrorCode.PARAM_INVALID,
        'lng/lat 越界',
        HttpStatus.BAD_REQUEST
      )
    }
    const cacheKey = `shop:deliveryArea:${dto.shopId}`
    const cached = await this.safeGet<{
      areaId: string
      polygon: { type: 'Polygon'; coordinates: number[][][] }
      deliveryFee: number | null
      minOrder: number | null
    }>(cacheKey)
    let area = cached
    if (!area) {
      const row = await this.dataSource
        .createQueryBuilder()
        .select([
          'da.id AS id',
          'da.polygon AS polygon',
          'da.delivery_fee AS deliveryFee',
          'da.min_order AS minOrder'
        ])
        .from('delivery_area', 'da')
        .where(
          'da.area_type = :type AND da.owner_id = :ownerId AND da.status = 1 AND da.is_deleted = 0',
          {
            type: 1,
            ownerId: dto.shopId
          }
        )
        .orderBy('da.priority', 'DESC')
        .limit(1)
        .getRawOne<{
          id: string
          polygon: unknown
          deliveryFee: string | null
          minOrder: string | null
        }>()
      if (!row) {
        return { within: false }
      }
      const poly =
        typeof row.polygon === 'string'
          ? (JSON.parse(row.polygon) as { type: 'Polygon'; coordinates: number[][][] })
          : (row.polygon as { type: 'Polygon'; coordinates: number[][][] })
      area = {
        areaId: row.id,
        polygon: poly,
        deliveryFee: row.deliveryFee != null ? Number(row.deliveryFee) : null,
        minOrder: row.minOrder != null ? Number(row.minOrder) : null
      }
      await this.safeSet(cacheKey, area, CACHE_TTL.shopArea)
    }
    const within = isPointInPolygon([dto.lng, dto.lat], area.polygon)
    return {
      within,
      areaId: within ? area.areaId : undefined,
      deliveryFee: within && area.deliveryFee != null ? area.deliveryFee : undefined,
      minOrder: within && area.minOrder != null ? area.minOrder : undefined
    }
  }

  /**
   * 主动设置/覆盖商户配送范围缓存（业务模块用）
   *
   * 用途：商户后台保存 polygon 时调用；不写库，库由商户后台 service 自行写
   * 参数：dto SetShopAreaDto
   * 返回值：void
   */
  async setShopArea(dto: SetShopAreaDto): Promise<void> {
    const cacheKey = `shop:deliveryArea:${dto.shopId}`
    const value = {
      areaId: dto.shopId,
      polygon: dto.polygon,
      deliveryFee: dto.deliveryFee ?? null,
      minOrder: dto.minOrder ?? null
    }
    if (dto.overwrite === false) {
      const exists = await this.redis.exists(cacheKey)
      if (exists) return
    }
    await this.safeSet(cacheKey, value, CACHE_TTL.shopArea)
  }

  /**
   * 查询订单轨迹（rider_location_ts）
   *
   * 参数：riderId / orderNo / fromTs ISO（可选） / toTs ISO（可选）
   * 返回值：TrackResultDto（含 GeoJSON LineString）
   */
  async queryTrack(
    riderId: string,
    orderNo: string,
    fromTs?: string,
    toTs?: string
  ): Promise<TrackResultDto> {
    const args: unknown[] = [riderId, orderNo]
    let where = 'rider_id = $1 AND order_no = $2'
    if (fromTs) {
      args.push(new Date(fromTs))
      where += ` AND time >= $${args.length}`
    }
    if (toTs) {
      args.push(new Date(toTs))
      where += ` AND time <= $${args.length}`
    }
    const sql = `SELECT EXTRACT(EPOCH FROM time)*1000 AS ts_ms, lng, lat, speed_kmh
                 FROM rider_location_ts
                 WHERE ${where}
                 ORDER BY time ASC
                 LIMIT 5000`
    let rows: Array<{ ts_ms: string; lng: number; lat: number; speed_kmh: number | null }> = []
    try {
      const result = await this.tsPool.query(sql, args)
      rows = result.rows as typeof rows
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`TimescaleDB 查询失败 rider=${riderId} order=${orderNo}：${msg}`)
      throw new BusinessException(
        BizErrorCode.SYSTEM_DB_ERROR,
        `轨迹查询失败：${msg}`,
        HttpStatus.BAD_GATEWAY
      )
    }
    const coordinates: number[][] = rows.map((r) => [Number(r.lng), Number(r.lat)])
    const timestamps: number[] = rows.map((r) => Math.round(Number(r.ts_ms)))
    const totalDistanceM = trackTotalLengthM(coordinates)
    const startMs = timestamps.at(0) ?? 0
    const endMs = timestamps.at(-1) ?? 0
    const durationS = endMs > startMs ? (endMs - startMs) / 1000 : 0
    const avgSpeedKmh = durationS > 0 ? Math.round((totalDistanceM / durationS) * 3.6 * 10) / 10 : 0
    return {
      riderId,
      orderNo,
      pointCount: coordinates.length,
      geometry: { type: 'LineString', coordinates },
      timestamps,
      properties: { startMs, endMs, totalDistanceM: Math.round(totalDistanceM), avgSpeedKmh }
    }
  }

  /**
   * 安全读 Redis（异常时返回 null，不影响业务）
   * 参数：key
   * 返回值：泛型 T 或 null
   */
  private async safeGet<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch (err) {
      this.logger.warn(`Redis GET 失败 ${key}：${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  /**
   * 安全写 Redis（异常时仅 log，不影响业务）
   * 参数：key / value / ttl 秒
   * 返回值：void
   */
  private async safeSet<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl)
    } catch (err) {
      this.logger.warn(`Redis SET 失败 ${key}：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** MD5 helper */
  private md5(input: string): string {
    return createHash('md5').update(input).digest('hex')
  }
}
