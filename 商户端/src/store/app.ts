/**
 * @file store/app.ts
 * @stage P6/T6.4 (Sprint 1)
 * @desc 应用全局 Store：系统信息、版本、首次引导标记、前后台事件
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { logger } from '@/utils/logger'
import { stopWs } from '@/utils/ws'
import { getStorage, setStorage, STORAGE_KEYS } from '@/utils/storage'
import { stopRingtone, stopSilentAudio } from '@/utils/ringtone'

/** 应用级 Store */
export const useAppStore = defineStore(
  'app',
  () => {
    /** 系统信息 */
    const sysInfo = ref<UniApp.GetSystemInfoResult | null>(null)
    /** 应用版本 */
    const appVersion = ref<string>('0.1.0')
    /** 当前主题 */
    const theme = ref<'light' | 'dark'>('light')
    /** 已展示过的引导标记 */
    const guideFlags = ref<Record<string, true>>({})

    /** 初始化系统信息 */
    function initSysInfo() {
      try {
        sysInfo.value = uni.getSystemInfoSync()
        const env = (import.meta as unknown as { env?: Record<string, string> }).env
        appVersion.value = env?.VITE_APP_VERSION ?? '0.1.0'
        const flags = getStorage<Record<string, true>>(STORAGE_KEYS.GUIDE_FLAGS)
        if (flags) guideFlags.value = flags
      } catch (e) {
        logger.warn('app.initSysInfo.fail', { e: String(e) })
      }
    }

    /** 应用进入前台 */
    function onForeground() {
      logger.debug('app.foreground')
    }

    /** 应用进入后台：关闭 WS、停止铃声/语音；保活组件不在此停（由 NewOrderModal 控制） */
    function onBackground() {
      logger.debug('app.background')
      stopRingtone()
      stopWs()
    }

    /** 退出登录时强制清理所有运行时资源 */
    function cleanupAll() {
      stopRingtone()
      stopSilentAudio()
      stopWs()
    }

    /** 标记引导已展示 */
    function markGuideShown(key: string) {
      guideFlags.value[key] = true
      setStorage(STORAGE_KEYS.GUIDE_FLAGS, guideFlags.value)
    }

    /** 是否已展示过指定引导 */
    function hasShownGuide(key: string): boolean {
      return Boolean(guideFlags.value[key])
    }

    /** 切换主题 */
    function setTheme(t: 'light' | 'dark') {
      theme.value = t
      setStorage(STORAGE_KEYS.THEME, t)
    }

    return {
      sysInfo,
      appVersion,
      theme,
      guideFlags,
      initSysInfo,
      onForeground,
      onBackground,
      cleanupAll,
      markGuideShown,
      hasShownGuide,
      setTheme
    }
  },
  {
    persist: {
      key: 'o2o_mchnt_app',
      storage: {
        getItem: (k: string) => uni.getStorageSync(k) as string,
        setItem: (k: string, v: string) => uni.setStorageSync(k, v)
      },
      pick: ['theme', 'guideFlags']
    }
  }
)
