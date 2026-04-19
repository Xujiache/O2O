/**
 * @file store/location.ts
 * @stage P7/T7.4 (Sprint 1) + T7.26~T7.31 (Sprint 4)
 * @desc 定位 Store：当前位置、上报开关、电量、队列大小（聚合）
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import {
  startLocationReport,
  stopLocationReport,
  setCurrentOrder,
  flushNow,
  getLocationServiceState
} from '@/utils/location-service'
import { logger } from '@/utils/logger'

/** 当前位置 */
export interface LiveLocation {
  lng: number
  lat: number
  accuracy: number
  ts: number
  /** 反地理编码地址（异步） */
  address?: string
  /** 当前城市编码（防止跨城接单校验） */
  cityCode?: string
}

/** 定位 Store */
export const useLocationStore = defineStore('location', () => {
  /** 当前位置 */
  const current = ref<LiveLocation | null>(null)
  /** 是否正在上报 */
  const reporting = ref(false)
  /** 当前上报间隔（ms） */
  const intervalMs = ref(10_000)
  /** 当前电量（百分比） */
  const battery = ref<number | null>(null)
  /** 离线队列长度 */
  const queueSize = ref(0)

  /** 启动上报（上下班开始时由 work store 调） */
  function start(orderNo?: string): boolean {
    const auth = useAuthStore()
    if (!auth.user?.id) {
      logger.warn('location.start.skip', { reason: 'no riderId' })
      return false
    }
    startLocationReport({ riderId: auth.user.id, orderNo })
    syncState()
    return true
  }

  /** 停止上报 */
  async function stop(): Promise<void> {
    await stopLocationReport()
    syncState()
  }

  /** 切换当前订单号 */
  function setOrder(orderNo: string | undefined): void {
    setCurrentOrder(orderNo)
  }

  /** 应用进入后台：强制 flush */
  async function flushOnBackground(): Promise<void> {
    await flushNow()
    syncState()
  }

  /** 单次拉取当前位置（不开启上报）：用于打卡、紧急求助等场景 */
  function pickOnce(): Promise<LiveLocation | null> {
    return new Promise((resolve) => {
      uni.getLocation({
        type: 'gcj02',
        isHighAccuracy: true,
        success: (res) => {
          const v: LiveLocation = {
            lng: res.longitude,
            lat: res.latitude,
            accuracy: typeof res.accuracy === 'number' ? res.accuracy : 50,
            ts: Date.now()
          }
          current.value = v
          resolve(v)
        },
        fail: (err) => {
          logger.warn('location.pickOnce.fail', { e: String(err.errMsg ?? '') })
          resolve(null)
        }
      })
    })
  }

  /** 同步内部 service 状态到 store */
  function syncState(): void {
    const st = getLocationServiceState()
    reporting.value = st.isReporting
    intervalMs.value = st.intervalMs
    battery.value = st.battery
    queueSize.value = st.queueSize
    if (st.lastReported) {
      current.value = {
        lng: st.lastReported.lng,
        lat: st.lastReported.lat,
        accuracy: st.lastReported.accuracy,
        ts: st.lastReported.ts
      }
    }
  }

  return {
    current,
    reporting,
    intervalMs,
    battery,
    queueSize,
    start,
    stop,
    setOrder,
    flushOnBackground,
    pickOnce,
    syncState
  }
})
