import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point as turfPoint, polygon as turfPolygon } from '@turf/helpers'
import type { Feature, Polygon } from 'geojson'

/**
 * 地理工具（基于 turf.js v7）
 *
 * 设计：
 * - 仅暴露业务最常用的 4 类能力：点-多边形、Haversine 直线距离、轨迹累计长度、坐标合法性
 * - 不引入完整 @turf/turf（已 import 至 package.json，但本文件按需依赖子包以减少
 *   tree-shake 后的打包体积）
 * - 坐标系约定：所有方法以 GCJ-02 经纬度（高德返回值）为基准；不做 WGS84 ↔ GCJ-02 转换
 *
 * 用途：MapService.isWithin / 距离 / 轨迹长度
 */

/** 地球平均半径（米），与 turf 内部一致 */
const EARTH_RADIUS_M = 6371008.8

/**
 * 经纬度合法性
 * 参数：lng [-180,180]；lat [-90,90]
 * 返回值：true / false
 * 用途：所有入参都先过这里，避免 turf 在异常输入下抛错
 */
export function isLngLatValid(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  )
}

/**
 * Haversine 直线距离（米）
 *
 * 参数：fromLng/fromLat、toLng/toLat（GCJ-02）
 * 返回值：距离（米）
 * 用途：MapService.distance(type=0)；缓存命中前的兜底；批量距离过滤
 */
export function haversineDistanceM(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(toLat - fromLat)
  const dLng = toRad(toLng - fromLng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}

/**
 * 轨迹累计长度（米）
 *
 * 参数：coords [[lng,lat],...]，相邻两点累计
 * 返回值：总米数；coords 不足 2 点返回 0
 * 用途：MapService.queryTrack 计算 totalDistanceM
 */
export function trackTotalLengthM(coords: number[][]): number {
  if (!Array.isArray(coords) || coords.length < 2) return 0
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]
    const b = coords[i]
    if (!a || !b) continue
    total += haversineDistanceM(a[0]!, a[1]!, b[0]!, b[1]!)
  }
  return total
}

/**
 * 点是否在 GeoJSON Polygon 内（含边界）
 *
 * 参数：point [lng,lat]；polygon GeoJSON Polygon（含外环 + 可选内环）
 * 返回值：true / false
 * 错误：polygon 非法（环不闭合 / 点 < 4）→ turf 抛 Error；本函数会捕获并返回 false
 * 用途：MapService.isWithin（配送范围校验）
 */
export function isPointInPolygon(
  pointLngLat: [number, number],
  polygonGeoJson: Polygon | Feature<Polygon>
): boolean {
  try {
    if (!isLngLatValid(pointLngLat[0], pointLngLat[1])) return false
    const feature: Feature<Polygon> =
      polygonGeoJson.type === 'Feature'
        ? (polygonGeoJson as Feature<Polygon>)
        : turfPolygon(polygonGeoJson.coordinates)
    const ptFeature = turfPoint(pointLngLat)
    return booleanPointInPolygon(ptFeature, feature)
  } catch {
    return false
  }
}

/**
 * 把高德 polyline 字符串解析为 [[lng,lat],...] 数组
 *
 * 高德路径格式：`116.4806,39.9938;116.4047,39.9145;...`
 * 参数：polyline 字符串
 * 返回值：number[][]；非法时返回 []
 * 用途：MapService.routing
 */
export function parseAmapPolyline(polyline: string): number[][] {
  if (!polyline || typeof polyline !== 'string') return []
  return polyline
    .split(';')
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0)
    .map((seg) => seg.split(',').map((v) => Number(v)))
    .filter(([lng, lat]) => isLngLatValid(lng ?? NaN, lat ?? NaN)) as number[][]
}
