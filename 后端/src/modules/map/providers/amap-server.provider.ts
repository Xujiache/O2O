/**
 * @file amap-server.provider.ts
 * @stage P9/W5.B.2 (Sprint 5) — 高德 Web 服务（服务端）envelope HTTP（手写，不依赖 SDK）
 * @desc 与已有 AmapProvider 区别：
 *         - AmapProvider（Sprint 1 落库）：业务侧地图基础（geocode / regeocode 兜底）
 *         - AmapServerProvider（本类）：服务端高级路径规划（驾车 / 步行 / 骑行）+ 距离矩阵 +
 *           高精度逆地理；用于派单 ETA / 调度
 *
 * 设计原则（与 jpush.provider.ts / wechat-pay-v3.provider.ts 一致）：
 *   - AMAP_SERVER_KEY 缺失 → enabled=false + console.warn + 所有方法 no-op
 *   - 全 try/catch；失败仅 logger.error + 返回 { ok: false } 不抛错（best-effort）
 *   - HTTP 用全局 fetch；query 鉴权（key=...）
 *
 * 高德 Web 服务接口：
 *   - 驾车  /v3/direction/driving
 *   - 步行  /v3/direction/walking
 *   - 骑行  /v4/direction/bicycling
 *   - 距离矩阵 /v3/distance（origins 多坐标用 "|" 分隔）
 *   - 逆地理高精度 /v3/geocode/regeo?extensions=all（含 pois / roads / roadinters）
 *
 * @author Agent B (P9 Sprint 5)
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/* ============================================================================
 * 类型
 * ============================================================================ */

/** 通用返回 envelope */
export interface AmapServerResult<T> {
  ok: boolean
  data?: T
  reason?: string
  raw?: unknown
}

/** 路径规划（驾车 / 步行 / 骑行）返回 */
export interface RouteResultData {
  /** 路径距离（米） */
  distance: number
  /** 预计耗时（秒） */
  duration: number
  /** 高德 polyline 字符串（多段以 ";" 拼接） */
  polyline: string
}

/** 距离矩阵返回（二维：origins[i] × destinations[j]） */
export interface DistanceMatrixData {
  distance: number[][]
  duration: number[][]
}

/** 逆地理高精度返回 */
export interface RegeocodeHighPrecisionData {
  formatted: string
  province: string
  city: string
  district: string
  township: string
  pois: Array<{ id?: string; name?: string; type?: string; distance?: number }>
  roads: Array<{ id?: string; name?: string; distance?: number }>
  landmark?: { name: string; distance: number }
}

/** 路由可选参数（驾车策略 / 是否避开拥堵） */
export interface RouteOptions {
  /** 驾车策略 0-19，参考高德文档；默认 0（速度优先） */
  strategy?: number
  /** 起点 POI id（提高精度） */
  originId?: string
  /** 终点 POI id */
  destinationId?: string
  /** 是否返回 steps（默认 true） */
  withSteps?: boolean
}

/* ============================================================================
 * 内部类型（高德响应）
 * ============================================================================ */

interface AmapBaseResp {
  status: '0' | '1'
  info?: string
  infocode?: string
}

interface AmapV3PathStep {
  polyline?: string
}

interface AmapV3Path {
  distance: string
  duration: string
  polyline?: string
  steps?: AmapV3PathStep[]
}

interface AmapV3DirectionResp extends AmapBaseResp {
  route?: { paths?: AmapV3Path[] }
}

interface AmapV4BicyclingResp {
  errcode?: number
  data?: {
    paths?: Array<{
      distance: number
      duration: number
      steps?: Array<{ polyline?: string }>
    }>
  }
}

interface AmapDistanceItem {
  origin_id: string
  dest_id: string
  distance: string
  duration: string
}

interface AmapDistanceResp extends AmapBaseResp {
  results?: AmapDistanceItem[]
}

interface AmapRegeocodeResp extends AmapBaseResp {
  regeocode?: {
    formatted_address?: string
    addressComponent?: {
      province?: string
      city?: string | string[]
      district?: string
      township?: string
      streetNumber?: { street?: string; number?: string; distance?: string }
    }
    pois?: Array<{ id?: string; name?: string; type?: string; distance?: string }>
    roads?: Array<{ id?: string; name?: string; distance?: string }>
    /** 高德高精度返回的标志性地标（可选） */
    aois?: Array<{ name?: string; distance?: string }>
  }
}

/* ============================================================================
 * 内部常量
 * ============================================================================ */

const DEFAULT_BASE_URL = 'https://restapi.amap.com'
const HTTP_TIMEOUT_MS = 10000

/* ============================================================================
 * Provider
 * ============================================================================ */

@Injectable()
export class AmapServerProvider {
  private readonly logger = new Logger(AmapServerProvider.name)

  /** 是否启用（凭证齐全时为 true） */
  readonly enabled: boolean

  private readonly serverKey: string
  private readonly baseUrl: string

  constructor(config: ConfigService) {
    this.serverKey = config.get<string>('AMAP_SERVER_KEY', '')
    this.baseUrl = config.get<string>('AMAP_SERVER_BASE_URL', DEFAULT_BASE_URL)
    this.enabled = Boolean(this.serverKey)

    if (!this.enabled) {
      // eslint-disable-next-line no-console
      console.warn('[AmapServerProvider] disabled: 缺少 AMAP_SERVER_KEY（所有方法走 no-op）')
    } else {
      this.logger.log(`[AmapServerProvider] enabled baseUrl=${this.baseUrl}`)
    }
  }

  /* ============================================================================
   * 1. 驾车路径规划
   * ============================================================================ */

  /**
   * 驾车路径规划
   * 参数：originLng / originLat / destLng / destLat / opts
   * 返回值：AmapServerResult<RouteResultData>
   */
  async routeDriving(
    originLng: number,
    originLat: number,
    destLng: number,
    destLat: number,
    opts?: RouteOptions
  ): Promise<AmapServerResult<RouteResultData>> {
    if (!this.enabled) return this.disabledResult('routeDriving')
    const params: Record<string, string> = {
      origin: `${originLng},${originLat}`,
      destination: `${destLng},${destLat}`,
      output: 'JSON',
      extensions: opts?.withSteps === false ? 'base' : 'all'
    }
    if (opts?.strategy !== undefined) params.strategy = String(opts.strategy)
    if (opts?.originId) params.originid = opts.originId
    if (opts?.destinationId) params.destinationid = opts.destinationId

    return this.requestV3Path('/v3/direction/driving', params)
  }

  /* ============================================================================
   * 2. 步行路径规划
   * ============================================================================ */

  /**
   * 步行路径规划
   * 参数：起点 / 终点
   * 返回值：AmapServerResult<RouteResultData>
   */
  async routeWalking(
    originLng: number,
    originLat: number,
    destLng: number,
    destLat: number
  ): Promise<AmapServerResult<RouteResultData>> {
    if (!this.enabled) return this.disabledResult('routeWalking')
    return this.requestV3Path('/v3/direction/walking', {
      origin: `${originLng},${originLat}`,
      destination: `${destLng},${destLat}`,
      output: 'JSON'
    })
  }

  /* ============================================================================
   * 3. 骑行路径规划（v4）
   * ============================================================================ */

  /**
   * 骑行路径规划（v4 接口；返回结构与 v3 不同，本类内部已统一）
   * 参数：起点 / 终点
   * 返回值：AmapServerResult<RouteResultData>
   */
  async routeRiding(
    originLng: number,
    originLat: number,
    destLng: number,
    destLat: number
  ): Promise<AmapServerResult<RouteResultData>> {
    if (!this.enabled) return this.disabledResult('routeRiding')
    try {
      const url = this.buildUrl('/v4/direction/bicycling', {
        origin: `${originLng},${originLat}`,
        destination: `${destLng},${destLat}`,
        output: 'JSON'
      })
      const resp = await this.fetchWithTimeout(url)
      const text = await resp.text()
      if (resp.status >= 400) {
        this.logger.error(
          `[AmapServerProvider] routeRiding HTTP ${resp.status}: ${text.slice(0, 300)}`
        )
        return { ok: false, reason: `http_${resp.status}` }
      }
      const json = JSON.parse(text) as AmapV4BicyclingResp
      if (json.errcode !== undefined && json.errcode !== 0) {
        return { ok: false, reason: `amap_errcode_${json.errcode}`, raw: json }
      }
      const path = json.data?.paths?.[0]
      if (!path) return { ok: false, reason: 'no_path', raw: json }

      const polyline = (path.steps ?? [])
        .map((s) => s.polyline ?? '')
        .filter((s) => Boolean(s))
        .join(';')

      return {
        ok: true,
        data: {
          distance: Number(path.distance) || 0,
          duration: Number(path.duration) || 0,
          polyline
        },
        raw: json
      }
    } catch (err) {
      this.logger.error(`[AmapServerProvider] routeRiding error: ${(err as Error).message}`)
      return { ok: false, reason: 'network_error' }
    }
  }

  /* ============================================================================
   * 4. 距离矩阵
   * ============================================================================ */

  /**
   * 距离矩阵（多起点 × 多终点）
   * 参数：origins / destinations 形如 [[lng,lat], ...]
   * 返回值：AmapServerResult<DistanceMatrixData>
   *
   * 实现：高德 distance 单接口最多 100 origins × 1 destination；
   *      本方法对每个 destination 单独发一次（最多 N 次 fetch）。
   */
  async distanceMatrix(
    origins: Array<[number, number]>,
    destinations: Array<[number, number]>
  ): Promise<AmapServerResult<DistanceMatrixData>> {
    if (!this.enabled) return this.disabledResult('distanceMatrix')
    if (origins.length === 0 || destinations.length === 0) {
      return { ok: false, reason: 'empty_origins_or_destinations' }
    }
    try {
      const distance: number[][] = origins.map(() => new Array<number>(destinations.length).fill(0))
      const duration: number[][] = origins.map(() => new Array<number>(destinations.length).fill(0))

      const originsStr = origins.map(([lng, lat]) => `${lng},${lat}`).join('|')

      for (let j = 0; j < destinations.length; j++) {
        const [dlng, dlat] = destinations[j]
        const url = this.buildUrl('/v3/distance', {
          origins: originsStr,
          destination: `${dlng},${dlat}`,
          type: '1',
          output: 'JSON'
        })
        const resp = await this.fetchWithTimeout(url)
        const text = await resp.text()
        if (resp.status >= 400) {
          this.logger.error(
            `[AmapServerProvider] distanceMatrix HTTP ${resp.status}: ${text.slice(0, 300)}`
          )
          return { ok: false, reason: `http_${resp.status}` }
        }
        const json = JSON.parse(text) as AmapDistanceResp
        if (json.status !== '1') {
          return { ok: false, reason: `amap_status_${json.infocode ?? '0'}`, raw: json }
        }
        const items = json.results ?? []
        /* origin_id 从 1 开始（按高德规范） */
        for (const item of items) {
          const i = Number(item.origin_id) - 1
          if (i >= 0 && i < origins.length) {
            distance[i][j] = Number(item.distance) || 0
            duration[i][j] = Number(item.duration) || 0
          }
        }
      }

      return { ok: true, data: { distance, duration } }
    } catch (err) {
      this.logger.error(`[AmapServerProvider] distanceMatrix error: ${(err as Error).message}`)
      return { ok: false, reason: 'network_error' }
    }
  }

  /* ============================================================================
   * 5. 逆地理高精度
   * ============================================================================ */

  /**
   * 逆地理高精度（含 POI / 道路 / 标志性地标）
   * 参数：lng / lat
   * 返回值：AmapServerResult<RegeocodeHighPrecisionData>
   */
  async regeocodeHighPrecision(
    lng: number,
    lat: number
  ): Promise<AmapServerResult<RegeocodeHighPrecisionData>> {
    if (!this.enabled) return this.disabledResult('regeocodeHighPrecision')
    try {
      const url = this.buildUrl('/v3/geocode/regeo', {
        location: `${lng},${lat}`,
        extensions: 'all',
        output: 'JSON',
        radius: '500'
      })
      const resp = await this.fetchWithTimeout(url)
      const text = await resp.text()
      if (resp.status >= 400) {
        this.logger.error(
          `[AmapServerProvider] regeocodeHighPrecision HTTP ${resp.status}: ${text.slice(0, 300)}`
        )
        return { ok: false, reason: `http_${resp.status}` }
      }
      const json = JSON.parse(text) as AmapRegeocodeResp
      if (json.status !== '1' || !json.regeocode) {
        return { ok: false, reason: `amap_status_${json.infocode ?? '0'}`, raw: json }
      }
      const r = json.regeocode
      const ac = r.addressComponent ?? {}
      const cityStr = typeof ac.city === 'string' ? ac.city : Array.isArray(ac.city) ? '' : ''
      const aoi = r.aois?.[0]
      const data: RegeocodeHighPrecisionData = {
        formatted: r.formatted_address ?? '',
        province: ac.province ?? '',
        city: cityStr,
        district: ac.district ?? '',
        township: ac.township ?? '',
        pois: (r.pois ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          distance: p.distance !== undefined ? Number(p.distance) : undefined
        })),
        roads: (r.roads ?? []).map((rd) => ({
          id: rd.id,
          name: rd.name,
          distance: rd.distance !== undefined ? Number(rd.distance) : undefined
        })),
        landmark: aoi?.name
          ? { name: aoi.name, distance: aoi.distance !== undefined ? Number(aoi.distance) : 0 }
          : undefined
      }
      return { ok: true, data, raw: json }
    } catch (err) {
      this.logger.error(
        `[AmapServerProvider] regeocodeHighPrecision error: ${(err as Error).message}`
      )
      return { ok: false, reason: 'network_error' }
    }
  }

  /* ============================================================================
   * 内部工具
   * ============================================================================ */

  /**
   * v3 路径规划通用请求（driving / walking 共用）
   */
  private async requestV3Path(
    path: string,
    params: Record<string, string>
  ): Promise<AmapServerResult<RouteResultData>> {
    try {
      const url = this.buildUrl(path, params)
      const resp = await this.fetchWithTimeout(url)
      const text = await resp.text()
      if (resp.status >= 400) {
        this.logger.error(`[AmapServerProvider] ${path} HTTP ${resp.status}: ${text.slice(0, 300)}`)
        return { ok: false, reason: `http_${resp.status}` }
      }
      const json = JSON.parse(text) as AmapV3DirectionResp
      if (json.status !== '1') {
        return { ok: false, reason: `amap_status_${json.infocode ?? '0'}`, raw: json }
      }
      const path0 = json.route?.paths?.[0]
      if (!path0) return { ok: false, reason: 'no_path', raw: json }

      const polylineSegments: string[] = []
      if (path0.polyline) polylineSegments.push(path0.polyline)
      for (const step of path0.steps ?? []) {
        if (step.polyline) polylineSegments.push(step.polyline)
      }
      return {
        ok: true,
        data: {
          distance: Number(path0.distance) || 0,
          duration: Number(path0.duration) || 0,
          polyline: polylineSegments.join(';')
        },
        raw: json
      }
    } catch (err) {
      this.logger.error(`[AmapServerProvider] ${path} error: ${(err as Error).message}`)
      return { ok: false, reason: 'network_error' }
    }
  }

  /** 构造 URL（追加 key） */
  private buildUrl(path: string, params: Record<string, string>): string {
    const url = new URL(path, this.baseUrl)
    url.searchParams.set('key', this.serverKey)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
    return url.toString()
  }

  /** 带超时 fetch */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
    try {
      return await fetch(url, { method: 'GET', signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  /** 统一构造 disabled 返回（泛型 T 调用方按需推断） */
  private disabledResult<T>(method: string): AmapServerResult<T> {
    // eslint-disable-next-line no-console
    console.warn(`[AmapServerProvider] ${method} no-op (disabled)`)
    return { ok: false, reason: 'disabled' }
  }
}
