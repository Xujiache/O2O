/**
 * @file store/work.ts
 * @stage P7/T7.4 (Sprint 1) + T7.10 (Sprint 2)
 * @desc 工作台 Store：上下班开关编排、今日数据、接单偏好
 *
 * 上下班编排（DESIGN_P7 §3.2）：
 *   开始接单 → 1) 校验 canAcceptOrders 2) 调 /rider/work/on 打卡
 *           → 3) 启动定位上报（location store）4) 启动 Foreground Service / silent.wav
 *           → 5) 启动 WS 6) 注册极光推送
 *   结束接单 → 反向关闭
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import { useLocationStore } from './location'
import { startWs, stopWs } from '@/utils/ws'
import { startForegroundService, stopForegroundService } from '@/utils/foreground-service'
import { startSilentAudio, stopSilentAudio } from '@/utils/ringtone'
import { registerJPush } from '@/utils/jpush'
import { post } from '@/utils/request'
import { getStorage, setStorage, STORAGE_KEYS } from '@/utils/storage'
import { logger } from '@/utils/logger'
import { track, TRACK } from '@/utils/track'
import type { AcceptPreference } from '@/types/biz'
import { getBlockReason } from '@/utils/permission'

const DEFAULT_PREFERENCE: AcceptPreference = {
  mode: 1,
  bizType: 3,
  radius: 3000,
  maxConcurrent: 3,
  acceptRouteShare: true
}

/** 今日数据卡 */
export interface TodayStat {
  income: string
  orderCount: number
  onTimeRate: string
  goodRate: string
  /** 在线总秒数 */
  onlineSeconds: number
  /** 当前并行单数 */
  inProgressCount: number
}

const DEFAULT_TODAY: TodayStat = {
  income: '0.00',
  orderCount: 0,
  onTimeRate: '0%',
  goodRate: '0%',
  onlineSeconds: 0,
  inProgressCount: 0
}

/** 工作台 Store */
export const useWorkStore = defineStore('work', () => {
  const today = ref<TodayStat>(DEFAULT_TODAY)
  const preference = ref<AcceptPreference>(
    getStorage<AcceptPreference>(STORAGE_KEYS.ACCEPT_PREFERENCE) ?? DEFAULT_PREFERENCE
  )
  const switching = ref(false)
  /** 上岗起始时间（用于 onlineSeconds 实时显示） */
  const onDutySince = ref<number | null>(null)

  const onlineMinutes = computed(() => {
    if (!onDutySince.value) return today.value.onlineSeconds / 60
    return (today.value.onlineSeconds + (Date.now() - onDutySince.value) / 1000) / 60
  })

  /** 设置接单偏好（本地缓存 + 后端同步） */
  async function setPreference(p: Partial<AcceptPreference>): Promise<void> {
    preference.value = { ...preference.value, ...p }
    setStorage(STORAGE_KEYS.ACCEPT_PREFERENCE, preference.value)
    try {
      await post('/rider/preference', preference.value, { silent: true, retry: 1 })
    } catch (e) {
      logger.warn('work.preference.sync.fail', { e: String(e) })
    }
  }

  /** 拉取今日数据 */
  async function refreshToday(): Promise<void> {
    try {
      const data = await post<TodayStat>('/rider/work/today', {}, { silent: true, retry: 1 })
      today.value = { ...DEFAULT_TODAY, ...data }
    } catch (e) {
      logger.warn('work.today.load.fail', { e: String(e) })
    }
  }

  /** 开始接单 */
  async function goOnDuty(opt: {
    lng: number
    lat: number
    address?: string
  }): Promise<{ ok: boolean; reason?: string }> {
    const auth = useAuthStore()
    const reason = getBlockReason(auth.riderProfile)
    if (reason) {
      return { ok: false, reason }
    }
    if (auth.onDuty) return { ok: true }
    if (switching.value) return { ok: false, reason: '正在切换状态，请稍后' }
    switching.value = true
    try {
      await post(
        '/rider/work/on',
        { lng: opt.lng, lat: opt.lat, address: opt.address ?? '' },
        { retry: 1 }
      )
      auth.setOnDuty(true)
      onDutySince.value = Date.now()
      /* 启动定位上报（核心） */
      const loc = useLocationStore()
      loc.start()
      /* Android 前台服务 / iOS 静音音频 */
      startForegroundService({
        title: 'O2O 骑手端 · 接单中',
        content: '正在接收新订单，请保持联系畅通'
      })
      startSilentAudio()
      /* WS + 极光推送 */
      if (auth.user?.id) startWs(auth.user.id)
      void registerJPush()
      track(TRACK.CLICK_GO_ON_DUTY, { riderId: auth.user?.id })
      logger.info('work.on-duty.ok')
      return { ok: true }
    } catch (e) {
      logger.warn('work.on-duty.fail', { e: String(e) })
      return { ok: false, reason: e instanceof Error ? e.message : '上线失败' }
    } finally {
      switching.value = false
    }
  }

  /** 结束接单 */
  async function goOffDuty(opt: { lng: number; lat: number }): Promise<boolean> {
    const auth = useAuthStore()
    if (!auth.onDuty) return true
    if (switching.value) return false
    switching.value = true
    try {
      await post('/rider/work/off', { lng: opt.lng, lat: opt.lat }, { retry: 1 })
      auth.setOnDuty(false)
      if (onDutySince.value) {
        today.value.onlineSeconds += Math.floor((Date.now() - onDutySince.value) / 1000)
        onDutySince.value = null
      }
      const loc = useLocationStore()
      await loc.stop()
      stopForegroundService()
      stopSilentAudio()
      stopWs()
      track(TRACK.CLICK_GO_OFF_DUTY, { riderId: auth.user?.id })
      logger.info('work.off-duty.ok')
      return true
    } catch (e) {
      logger.warn('work.off-duty.fail', { e: String(e) })
      return false
    } finally {
      switching.value = false
    }
  }

  return {
    today,
    preference,
    switching,
    onDutySince,
    onlineMinutes,
    setPreference,
    refreshToday,
    goOnDuty,
    goOffDuty
  }
})
