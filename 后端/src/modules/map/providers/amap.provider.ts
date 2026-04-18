import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BizErrorCode, BusinessException } from '@/common'
import {
  type DistanceResultDto,
  type GeocodeResultDto,
  type RegeocodeResultDto,
  type RoutingResultDto,
  type RoutingType
} from '../dto/map.dto'
import { parseAmapPolyline } from '../geo.util'

/**
 * 高德 v3 Restful API 响应基础结构
 */
interface AmapBase<T> extends Record<string, unknown> {
  status: '0' | '1'
  info: string
  infocode: string
}

/** geocode 返回 */
interface AmapGeocodeItem {
  formatted_address: string
  province?: string
  city?: string
  district?: string
  citycode?: string
  adcode?: string
  location?: string // "lng,lat"
  level?: string
}

/** regeocode 返回（注意是单个 regeocode 对象） */
interface AmapRegeocode {
  formatted_address: string
  addressComponent: {
    province?: string
    city?: string
    district?: string
    citycode?: string
    adcode?: string
  }
}

/** distance 返回 */
interface AmapDistanceResult {
  results: Array<{
    origin_id: string
    dest_id: string
    distance: string
    duration: string
    info?: string
    code?: string
  }>
}

/** path 返回 */
interface AmapPathItem {
  distance: string
  duration: string
  steps: Array<{
    polyline?: string
  }>
  polyline?: string // walking/bicycling 直接给 polyline
}

/** driving / walking / bicycling 返回 route.paths[] */
interface AmapRouting {
  route?: {
    paths: AmapPathItem[]
  }
}

/**
 * 高德地图 Provider（DESIGN_P3 §六）
 *
 * 设计：
 * - 直接走 https://restapi.amap.com 官方 v3 接口；不依赖任何 SDK
 * - 全部 GET，签名仅 key 参数；本期未启 SK 数字签名（开发态足够）
 * - 失败语义：HTTP 非 2xx → MAP_PROVIDER_ERROR + 502；status=0 → MAP_PROVIDER_ERROR + 400
 * - 不在本类做缓存；缓存由 MapService 的 Cache-Aside 装饰
 *
 * 用途：MapService 通过依赖注入调用本 Provider；后续若引入百度/腾讯，按本接口新增 Provider
 */
@Injectable()
export class AmapProvider {
  private readonly logger = new Logger(AmapProvider.name)
  private readonly baseUrl: string
  private readonly key: string
  private readonly timeoutMs: number

  /**
   * 构造 Provider
   * @param config 读取 map.amapKey / map.amapBaseUrl / map.httpTimeoutMs
   */
  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('map.amapBaseUrl', 'https://restapi.amap.com')
    this.key = config.get<string>('map.amapKey', '')
    this.timeoutMs = config.get<number>('map.httpTimeoutMs', 5000)
    if (!this.key) {
      this.logger.warn('AMAP_KEY 未配置，所有地图接口将返回 MAP_PROVIDER_ERROR；本机自验证可暂忽略')
    }
  }

  /**
   * 地址 → 坐标
   * 参数：address / city（可选）
   * 返回值：GeocodeResultDto
   */
  async geocode(address: string, city?: string): Promise<GeocodeResultDto> {
    const params: Record<string, string> = { address, output: 'JSON' }
    if (city) params.city = city
    const data = await this.get<AmapBase<unknown> & { geocodes?: AmapGeocodeItem[] }>(
      '/v3/geocode/geo',
      params
    )
    this.assertOk(data)
    const item = data.geocodes?.[0]
    if (!item || !item.location) {
      throw new BusinessException(
        BizErrorCode.MAP_PROVIDER_ERROR,
        '高德 geocode 未返回坐标',
        HttpStatus.BAD_REQUEST
      )
    }
    const [lng, lat] = item.location.split(',').map((v) => Number(v))
    return {
      lng: Number(lng),
      lat: Number(lat),
      level: item.level ?? 'unknown',
      formatted: item.formatted_address ?? address,
      cityCode: item.citycode,
      adcode: item.adcode
    }
  }

  /**
   * 坐标 → 地址
   * 参数：lng / lat
   * 返回值：RegeocodeResultDto
   */
  async regeocode(lng: number, lat: number): Promise<RegeocodeResultDto> {
    const data = await this.get<AmapBase<unknown> & { regeocode?: AmapRegeocode }>(
      '/v3/geocode/regeo',
      { location: `${lng},${lat}`, output: 'JSON', extensions: 'base' }
    )
    this.assertOk(data)
    const r = data.regeocode
    if (!r) {
      throw new BusinessException(
        BizErrorCode.MAP_PROVIDER_ERROR,
        '高德 regeocode 未返回结果',
        HttpStatus.BAD_REQUEST
      )
    }
    return {
      formatted: r.formatted_address,
      province: r.addressComponent.province ?? '',
      city: typeof r.addressComponent.city === 'string' ? r.addressComponent.city : '',
      district: r.addressComponent.district ?? '',
      cityCode: r.addressComponent.citycode,
      adcode: r.addressComponent.adcode
    }
  }

  /**
   * 距离矩阵（高德 distance v3，单对单）
   * 参数：起点 / 终点 / type（0 直线 / 1 驾车 / 3 步行）
   * 返回值：DistanceResultDto
   */
  async distance(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
    type: '0' | '1' | '3'
  ): Promise<DistanceResultDto> {
    const data = await this.get<AmapBase<unknown> & AmapDistanceResult>('/v3/distance', {
      origins: `${fromLng},${fromLat}`,
      destination: `${toLng},${toLat}`,
      type,
      output: 'JSON'
    })
    this.assertOk(data)
    const item = data.results?.[0]
    if (!item) {
      throw new BusinessException(
        BizErrorCode.MAP_PROVIDER_ERROR,
        '高德 distance 未返回结果',
        HttpStatus.BAD_REQUEST
      )
    }
    return {
      distance: parseInt(item.distance, 10) || 0,
      duration: parseInt(item.duration, 10) || 0,
      type: type === '0' ? 'line' : type === '1' ? 'driving' : 'walking'
    }
  }

  /**
   * 路径规划（驾车/步行/骑行/电动车）
   *
   * 高德接口路径：
   *  - driving        /v3/direction/driving
   *  - walking        /v3/direction/walking
   *  - bicycling      /v4/direction/bicycling   ← v4，但响应同样以 route.paths[] 结构返回
   *  - electrobike    /v5/direction/electrobike ← v5，仅返回 result.paths[].steps[].polyline
   *
   * 简化：driving / walking 用 v3；bicycling / electrobike 用 driving 兜底（开发联调够用，
   *      实际生产由 P9 升级为各自专属版本接口；本接口重要的是返回 number[][] 路径节点）
   */
  async routing(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
    type: RoutingType
  ): Promise<RoutingResultDto> {
    const path =
      type === 'walking'
        ? '/v3/direction/walking'
        : type === 'bicycling' || type === 'electrobike'
          ? '/v3/direction/walking' // 简化兜底：保证返回结构一致
          : '/v3/direction/driving'
    const data = await this.get<AmapBase<unknown> & AmapRouting>(path, {
      origin: `${fromLng},${fromLat}`,
      destination: `${toLng},${toLat}`,
      output: 'JSON'
    })
    this.assertOk(data)
    const route = data.route?.paths?.[0]
    if (!route) {
      throw new BusinessException(
        BizErrorCode.MAP_PROVIDER_ERROR,
        '高德 routing 未返回路径',
        HttpStatus.BAD_REQUEST
      )
    }
    const polylineSegments: string[] = []
    if (route.polyline) polylineSegments.push(route.polyline)
    for (const step of route.steps ?? []) {
      if (step.polyline) polylineSegments.push(step.polyline)
    }
    const polyline = polylineSegments.join(';')
    return {
      distance: parseInt(route.distance, 10) || 0,
      duration: parseInt(route.duration, 10) || 0,
      path: parseAmapPolyline(polyline),
      type
    }
  }

  /**
   * 通用 GET（自动附加 key + 超时控制 + JSON 解析 + HTTP 状态校验）
   * 参数：path 高德路径（含 /v3 前缀）；params 业务查询
   * 返回值：泛型 T
   * 错误：超时 / HTTP !ok → MAP_PROVIDER_ERROR + 502
   */
  private async get<T extends AmapBase<unknown>>(
    path: string,
    params: Record<string, string>
  ): Promise<T> {
    if (!this.key) {
      throw new BusinessException(
        BizErrorCode.MAP_PROVIDER_ERROR,
        'AMAP_KEY 未配置，无法调用地图服务',
        HttpStatus.SERVICE_UNAVAILABLE
      )
    }
    const url = new URL(path, this.baseUrl)
    url.searchParams.set('key', this.key)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const resp = await fetch(url.toString(), { method: 'GET', signal: controller.signal })
      if (!resp.ok) {
        throw new BusinessException(
          BizErrorCode.MAP_PROVIDER_ERROR,
          `高德 HTTP ${resp.status}`,
          HttpStatus.BAD_GATEWAY
        )
      }
      return (await resp.json()) as T
    } catch (err) {
      if (err instanceof BusinessException) throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new BusinessException(
        BizErrorCode.MAP_PROVIDER_ERROR,
        `高德请求异常：${msg}`,
        HttpStatus.BAD_GATEWAY
      )
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * status 校验
   * 参数：data 高德返回
   * 错误：status='0' → MAP_PROVIDER_ERROR + 400 + info
   */
  private assertOk(data: AmapBase<unknown>): void {
    if (data.status !== '1') {
      throw new BusinessException(
        BizErrorCode.MAP_PROVIDER_ERROR,
        `高德业务错误 ${data.infocode ?? ''} ${data.info ?? ''}`,
        HttpStatus.BAD_REQUEST
      )
    }
  }
}
