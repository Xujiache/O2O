/**
 * @file kalman.ts
 * @stage P7/T7.30 (Sprint 4)
 * @desc 一维卡尔曼滤波器（lng/lat 各跑一个实例）
 *
 * 提示词 §5.5 / §5.5 验收 V7.19：
 *   构造 50 个连续点（含 5 个漂移 ≥ 50m），断言滤波后所有点漂移 ≤ 15m
 *
 * 严禁使用 any / @ts-ignore；类型严格
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */

/**
 * 一维卡尔曼滤波器
 *
 * 状态变量：x（当前估计值）
 * 噪声：q 过程噪声方差 / r 观测噪声方差
 *   q 越小 = 越信任历史预测；r 越小 = 越信任新观测
 *   GPS 默认参数适合 1Hz 行人/电动车场景
 */
export class KalmanFilter1D {
  private readonly q: number
  private readonly r: number
  private p: number
  private x: number
  private k: number
  /** 是否首次更新 */
  private inited = false

  /**
   * @param processNoise 过程噪声（典型 1e-5；越小越信任历史预测）
   * @param measureNoise 观测噪声（典型 5e-2；越大越不信任新观测，对漂移抑制更强）
   */
  constructor(processNoise: number = 1e-5, measureNoise: number = 5e-2) {
    this.q = processNoise
    this.r = measureNoise
    this.p = 1
    this.x = 0
    this.k = 0
  }

  /**
   * 输入新观测，返回滤波后的估计值
   * @param measurement 原始观测值
   */
  filter(measurement: number): number {
    if (!this.inited) {
      this.x = measurement
      this.inited = true
      return measurement
    }
    /* 预测：p = p + q */
    this.p = this.p + this.q
    /* 卡尔曼增益：k = p / (p + r) */
    this.k = this.p / (this.p + this.r)
    /* 更新估计：x = x + k * (z - x) */
    this.x = this.x + this.k * (measurement - this.x)
    /* 更新协方差：p = (1 - k) * p */
    this.p = (1 - this.k) * this.p
    return this.x
  }

  /** 重置滤波器（重新接单 / 重启上岗） */
  reset(): void {
    this.p = 1
    this.x = 0
    this.k = 0
    this.inited = false
  }

  /** 当前估计值（未更新时为 0） */
  get current(): number {
    return this.x
  }
}

/**
 * 二维 GPS 滤波器（lng + lat 双 KF1D 组合）
 */
export class GpsKalman {
  private readonly lngKf: KalmanFilter1D
  private readonly latKf: KalmanFilter1D

  constructor(processNoise = 1e-5, measureNoise = 5e-2) {
    this.lngKf = new KalmanFilter1D(processNoise, measureNoise)
    this.latKf = new KalmanFilter1D(processNoise, measureNoise)
  }

  /**
   * 输入观测点，返回滤波后坐标
   */
  filter(point: { lng: number; lat: number }): { lng: number; lat: number } {
    return {
      lng: this.lngKf.filter(point.lng),
      lat: this.latKf.filter(point.lat)
    }
  }

  reset(): void {
    this.lngKf.reset()
    this.latKf.reset()
  }
}

/**
 * 球面距离（Haversine，单位：米）
 * 用于卡尔曼滤波后做漂移距离断言（≤ 15m）
 */
export function haversineMeters(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number }
): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
