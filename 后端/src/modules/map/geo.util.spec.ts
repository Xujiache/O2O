import {
  haversineDistanceM,
  isLngLatValid,
  isPointInPolygon,
  parseAmapPolyline,
  trackTotalLengthM
} from './geo.util'

/**
 * geo.util 单元测试
 *
 * 覆盖：
 * - 经纬度合法性
 * - Haversine 距离精度（北京天安门 → 北京西站 ≈ 6.5km）
 * - turf.booleanPointInPolygon（点在 / 不在）
 * - 高德 polyline 解析
 *
 * 用途：T3.24 GeoUtil 关键路径
 */
describe('geo.util', () => {
  describe('isLngLatValid', () => {
    it('合法点应返回 true', () => {
      expect(isLngLatValid(116.48, 39.99)).toBe(true)
      expect(isLngLatValid(0, 0)).toBe(true)
      expect(isLngLatValid(180, 90)).toBe(true)
      expect(isLngLatValid(-180, -90)).toBe(true)
    })
    it('越界 / NaN / Infinity 应返回 false', () => {
      expect(isLngLatValid(200, 39)).toBe(false)
      expect(isLngLatValid(116, 100)).toBe(false)
      expect(isLngLatValid(NaN, 39)).toBe(false)
      expect(isLngLatValid(116, Infinity)).toBe(false)
    })
  })

  describe('haversineDistanceM', () => {
    it('北京天安门 → 北京西站 应在 6~7km', () => {
      const tianAnMen: [number, number] = [116.40739, 39.90402]
      const beijingWest: [number, number] = [116.32213, 39.89396]
      const d = haversineDistanceM(tianAnMen[0], tianAnMen[1], beijingWest[0], beijingWest[1])
      expect(d).toBeGreaterThan(6000)
      expect(d).toBeLessThan(8000)
    })
    it('同一点距离应为 0', () => {
      expect(haversineDistanceM(116.4, 39.9, 116.4, 39.9)).toBe(0)
    })
  })

  describe('trackTotalLengthM', () => {
    it('少于 2 点 → 0', () => {
      expect(trackTotalLengthM([])).toBe(0)
      expect(trackTotalLengthM([[116, 39]])).toBe(0)
    })
    it('多点累加', () => {
      const coords = [
        [116.0, 39.0],
        [116.1, 39.0],
        [116.1, 39.1]
      ]
      const total = trackTotalLengthM(coords)
      expect(total).toBeGreaterThan(0)
      expect(total).toBeLessThan(50_000)
    })
  })

  describe('isPointInPolygon', () => {
    const polygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [116.47, 39.99],
          [116.49, 39.99],
          [116.49, 39.97],
          [116.47, 39.97],
          [116.47, 39.99]
        ]
      ]
    }
    it('点在多边形内 → true', () => {
      expect(isPointInPolygon([116.48, 39.98], polygon)).toBe(true)
    })
    it('点在多边形外 → false', () => {
      expect(isPointInPolygon([116.46, 39.98], polygon)).toBe(false)
      expect(isPointInPolygon([116.48, 40.5], polygon)).toBe(false)
    })
    it('非法 lng/lat → false（不抛错）', () => {
      expect(isPointInPolygon([NaN, 39], polygon)).toBe(false)
    })
  })

  describe('parseAmapPolyline', () => {
    it('合法字符串 → number[][]', () => {
      const r = parseAmapPolyline('116.48,39.99;116.50,39.97')
      expect(r.length).toBe(2)
      expect(r[0]).toEqual([116.48, 39.99])
    })
    it('空 / 非法 → []', () => {
      expect(parseAmapPolyline('')).toEqual([])
      expect(parseAmapPolyline('abc,def;')).toEqual([])
    })
  })
})
