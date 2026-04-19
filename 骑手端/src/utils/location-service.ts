/**
 * @file location-service.ts
 * @stage P7/T7.26~T7.31 (Sprint 4 核心)
 * @desc 高频定位上报服务（10s/次）+ 卡尔曼滤波 + 离线队列 + 电量降频
 *
 * 上报链路：
 *   uni.getLocation → KalmanFilter → shouldReport(>15m / >10s) → 内存批 →
 *     在线 → POST /map/rider/report 批量；
 *     离线 → enqueue OfflineQueue（最大 1000 点）；
 *     恢复后 → flush
 *
 * 电量感知：< 20% intervalMs 30s（V7.21）
 * 后台保活：依赖 foreground-service.ts (Android) + ringtone.startSilentAudio (iOS)
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type { LocationPoint, LocationBatch } from '@/types/biz'
import { post } from './request'
import { logger } from './logger'
import { offlineQueue } from './offline-queue'
import { GpsKalman, haversineMeters } from './kalman'
import { track, TRACK } from './track'

const DEFAULT_INTERVAL_MS = 10_000
const LOW_BATTERY_INTERVAL_MS = 30_000
const LOW_BATTERY_THRESHOLD = 20
const REPORT_DISTANCE_THRESHOLD_M = 15
/** 单次 flush 上报最多 N 条（避免 payload 过大；后端 P3 ACCEPTANCE 推荐 ≤ 100） */
const FLUSH_BATCH_SIZE = 100

let timer: ReturnType<typeof setInterval> | null = null
let kalman = new GpsKalman()
let lastReported: LocationPoint | null = null
let lastBattery: number | null = null
let intervalMs = DEFAULT_INTERVAL_MS
let currentRiderId = ''
let currentOrderNo: string | undefined
let isReporting = false

/** plus.device 自定义类型（@dcloudio/types 未声明 getCurrentLevel） */
interface PlusBattery {
  getCurrentLevel?: (success: (level: number) => void, error?: (e: unknown) => void) => void
  getStatus?: () => { level?: number }
}

/** 安全获取电量 */
function getBatteryLevel(): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const p = (globalThis as { plus?: { device?: { battery?: PlusBattery } } }).plus
      const batt = p?.device?.battery
      if (batt?.getCurrentLevel) {
        batt.getCurrentLevel(
          (level) => resolve(typeof level === 'number' ? level : null),
          () => resolve(null)
        )
        return
      }
      if (batt?.getStatus) {
        const st = batt.getStatus()
        resolve(typeof st?.level === 'number' ? st.level : null)
        return
      }
    } catch {
      /* ignore */
    }
    resolve(null)
  })
}

/** 检测网络是否在线 */
function isNetworkOnline(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      uni.getNetworkType({
        success: (res) => resolve(res.networkType !== 'none'),
        fail: () => resolve(true)
      })
    } catch {
      resolve(true)
    }
  })
}

/** 异步获取一次定位（高精度） */
function getLocationOnce(): Promise<{
  lng: number
  lat: number
  accuracy: number
  speed: number
  bearing: number
} | null> {
  return new Promise((resolve) => {
    uni.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      altitude: false,
      success: (res) => {
        const r = res as UniApp.GetLocationSuccess & { speed?: number; verticalAccuracy?: number }
        resolve({
          lng: res.longitude,
          lat: res.latitude,
          accuracy: typeof res.accuracy === 'number' ? res.accuracy : 50,
          speed: typeof r.speed === 'number' ? r.speed : 0,
          bearing: 0
        })
      },
      fail: (err) => {
        logger.warn('location.getOnce.fail', { e: String(err.errMsg ?? '') })
        resolve(null)
      }
    })
  })
}

/**
 * 是否应当本次上报：距上次 > 15m 或时间 > intervalMs
 */
function shouldReport(point: LocationPoint): boolean {
  if (!lastReported) return true
  const dist = haversineMeters(lastReported, point)
  if (dist >= REPORT_DISTANCE_THRESHOLD_M) return true
  if (point.ts - lastReported.ts >= intervalMs) return true
  return false
}

/**
 * 真正发起后端上报（含离线缓冲）
 * P6-R1 / I-02 教训：points 字段后端必须循环消费 N 个，不能仅取首个
 */
async function flushBatch(points: LocationPoint[]): Promise<boolean> {
  if (!points || points.length === 0) return true
  const online = await isNetworkOnline()
  if (!online) {
    offlineQueue.enqueueBatch(points)
    track(TRACK.LOCATION_OFFLINE, { count: points.length })
    return false
  }
  const batch: LocationBatch = {
    riderId: currentRiderId,
    points,
    battery: lastBattery ?? undefined
  }
  try {
    await post('/map/rider/report', batch, { silent: true, retry: 1, timeout: 8000 })
    return true
  } catch (e) {
    logger.warn('location.report.fail', {
      e: String(e),
      count: points.length
    })
    offlineQueue.enqueueBatch(points)
    return false
  }
}

/** 离线队列恢复补传 */
async function flushOfflineQueue(): Promise<void> {
  if (offlineQueue.size === 0) return
  const drained = offlineQueue.drain()
  /* 切片成 FLUSH_BATCH_SIZE 一组依次上报，失败回滚剩余 */
  for (let i = 0; i < drained.length; i += FLUSH_BATCH_SIZE) {
    const slice = drained.slice(i, i + FLUSH_BATCH_SIZE)
    const ok = await flushBatch(slice)
    if (!ok) {
      offlineQueue.rollback(drained.slice(i + FLUSH_BATCH_SIZE))
      return
    }
  }
  track(TRACK.LOCATION_RESUME, { count: drained.length })
  logger.info('location.offline.flushed', { count: drained.length })
}

/** 电量监听 + 自动降频 */
async function checkBatteryAndAdjust(): Promise<void> {
  const lvl = await getBatteryLevel()
  if (typeof lvl === 'number') {
    lastBattery = lvl
    const next = lvl < LOW_BATTERY_THRESHOLD ? LOW_BATTERY_INTERVAL_MS : DEFAULT_INTERVAL_MS
    if (next !== intervalMs) {
      intervalMs = next
      track(TRACK.LOCATION_DOWNGRADE, { battery: lvl, intervalMs })
      logger.info('location.battery.adjust', { battery: lvl, intervalMs })
      restartTimer()
    }
  }
}

/** 重启定时器（应用电量降频） */
function restartTimer(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  timer = setInterval(() => {
    void tick()
  }, intervalMs)
}

/** 定时执行：取定位 → 滤波 → 上报 */
async function tick(): Promise<void> {
  if (!isReporting) return
  const raw = await getLocationOnce()
  if (!raw) return
  const filtered = kalman.filter({ lng: raw.lng, lat: raw.lat })
  const point: LocationPoint = {
    lng: filtered.lng,
    lat: filtered.lat,
    accuracy: raw.accuracy,
    speed: raw.speed,
    bearing: raw.bearing,
    orderNo: currentOrderNo,
    ts: Date.now(),
    filtered: true
  }
  if (!shouldReport(point)) return
  await flushBatch([point])
  lastReported = point
  /* 网络恢复后顺带 flush 离线队列 */
  if (offlineQueue.size > 0) {
    void flushOfflineQueue()
  }
  /* 每 6 个上报检查一次电量（即 1 分钟） */
  if (Math.floor(Date.now() / intervalMs) % 6 === 0) {
    void checkBatteryAndAdjust()
  }
}

/** 配置 */
export interface StartOpt {
  /** 骑手 ID */
  riderId: string
  /** 当前承载订单号（多单时可在 setCurrentOrder 切换） */
  orderNo?: string
  /** 自定义间隔（ms） */
  intervalMs?: number
}

/** 启动定位上报（上下班开始） */
export function startLocationReport(opt: StartOpt): void {
  if (isReporting) return
  currentRiderId = opt.riderId
  currentOrderNo = opt.orderNo
  intervalMs = opt.intervalMs ?? DEFAULT_INTERVAL_MS
  kalman.reset()
  lastReported = null
  isReporting = true
  /* 立即拉一次首点 */
  void tick()
  restartTimer()
  /* 启动时检查一次电量，并尝试 flush 残留离线点 */
  void checkBatteryAndAdjust()
  void flushOfflineQueue()
  logger.info('location.report.start', { intervalMs })
}

/** 停止定位上报（下班 / 登出） */
export async function stopLocationReport(): Promise<void> {
  isReporting = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  /* 关闭前最后再 flush 一次离线队列 */
  await flushOfflineQueue()
  kalman.reset()
  lastReported = null
  logger.info('location.report.stop')
}

/** 切换当前订单号（多单顺路） */
export function setCurrentOrder(orderNo: string | undefined): void {
  currentOrderNo = orderNo
}

/** 强制 flush（应用进入后台时调用） */
export async function flushNow(): Promise<void> {
  await flushOfflineQueue()
}

/** 内部状态查询（调试 / 测试用） */
export function getLocationServiceState(): {
  isReporting: boolean
  intervalMs: number
  battery: number | null
  queueSize: number
  lastReported: LocationPoint | null
} {
  return {
    isReporting,
    intervalMs,
    battery: lastBattery,
    queueSize: offlineQueue.size,
    lastReported
  }
}

/** 测试钩子：注入自定义 kalman（仅 dev） */
export function _resetForTest(): void {
  kalman = new GpsKalman()
  lastReported = null
}
