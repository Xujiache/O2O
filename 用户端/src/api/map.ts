/**
 * @file api/map.ts
 * @stage P5/T5.9, T5.25 (Sprint 1/4)
 * @desc 地图 API：地址解析 / 距离 / 配送范围 / 骑手位置 / 轨迹查询
 * @author 单 Agent V2.0
 */
import { get, post } from '@/utils/request'
import type { City } from '@/types/biz'

export function geocode(params: { address: string; city?: string }): Promise<{
  lng: number
  lat: number
  formatted: string
  cityCode: string
  adcode: string
}> {
  return get('/map/geocode', params as Record<string, unknown>)
}

export function regeocode(params: { lng: number; lat: number }): Promise<{
  formatted: string
  province: string
  city: string
  district: string
  cityCode: string
  adcode: string
}> {
  return get('/map/regeocode', params as Record<string, unknown>)
}

export function distance(params: {
  fromLng: number
  fromLat: number
  toLng: number
  toLat: number
  /** 0 直线 / 1 驾车 / 3 步行 */
  type?: 0 | 1 | 3
}): Promise<{ distance: number; duration: number; type: number }> {
  return get('/map/distance', params as Record<string, unknown>)
}

export function routing(params: {
  fromLng: number
  fromLat: number
  toLng: number
  toLat: number
  routeType?: 'driving' | 'walking' | 'bicycling' | 'electrobike'
}): Promise<{
  distance: number
  duration: number
  path: Array<[number, number]>
  type: string
}> {
  return get('/map/routing', params as Record<string, unknown>)
}

export function withinArea(payload: {
  shopId: string
  lng: number
  lat: number
}): Promise<{ within: boolean; areaId?: string; deliveryFee?: string; minOrder?: string }> {
  return post('/map/within-area', payload)
}

export function getRiderTrack(
  riderId: string,
  orderNo: string,
  params?: { fromTs?: string; toTs?: string }
): Promise<{
  riderId: string
  orderNo: string
  pointCount: number
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> }
  timestamps: number[]
  properties: { startMs: number; endMs: number; totalDistanceM: number; avgSpeedKmh: number }
}> {
  return get(`/map/rider/${riderId}/track/${orderNo}`, params as Record<string, unknown>)
}

/* ========== 城市与区域 ========== */
export function listCities(): Promise<City[]> {
  return get('/region/cities')
}

export function getOpenedCities(): Promise<City[]> {
  return get('/region/cities/opened')
}
