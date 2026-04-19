/**
 * @file store/auth.ts
 * @stage P7/T7.4 (Sprint 1)
 * @desc 骑手端认证 Store：token、骑手资料、保证金、健康证、上下班状态
 *
 * P5/P6 经验：必须使用 pinia-plugin-persistedstate 持久化关键字段
 *   pick: token / refreshToken / user / depositPaid / healthCertExpireAt / onDuty
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RiderUser } from '@/types/biz'
import {
  getStorage,
  setStorage,
  removeStorage,
  clearOurStorage,
  STORAGE_KEYS
} from '@/utils/storage'
import { setRiderIdProvider } from '@/utils/request'
import { stopWs } from '@/utils/ws'
import { unregisterJPush } from '@/utils/jpush'
import { clearSentryUser, setSentryUser } from '@/utils/sentry'
import { logger } from '@/utils/logger'
import { canWork, type RiderProfile } from '@/utils/permission'

/** 骑手认证 Store */
export const useAuthStore = defineStore(
  'auth',
  () => {
    const token = ref<string>('')
    const refreshToken = ref<string>('')
    const user = ref<RiderUser | null>(null)
    const depositPaid = ref<boolean>(false)
    const healthCertExpireAt = ref<string | null>(null)
    /** 上下班状态（仅作 ref；具体启停由 work store 编排） */
    const onDuty = ref<boolean>(false)

    /** 是否已登录 */
    const isLoggedIn = computed<boolean>(() => Boolean(token.value && user.value))
    /** 是否审核通过（可上岗的前置） */
    const isApproved = computed<boolean>(() => user.value?.status === 'approved')
    /** 当前权限 profile（permission.canWork 用） */
    const riderProfile = computed<RiderProfile | null>(() => {
      if (!user.value) return null
      return {
        riderId: user.value.id,
        status: user.value.status,
        healthCertExpireAt: healthCertExpireAt.value,
        depositPaid: depositPaid.value,
        onDuty: onDuty.value,
        serviceCityCode: user.value.serviceCityCode
      }
    })
    /** 是否可以接单（综合判定） */
    const canAcceptOrders = computed<boolean>(() => canWork(riderProfile.value))

    /** 启动时从本地存储恢复 + 注入 request 头 provider */
    function restore() {
      const t = getStorage<string>(STORAGE_KEYS.TOKEN)
      const rt = getStorage<string>(STORAGE_KEYS.REFRESH_TOKEN)
      const u = getStorage<RiderUser>(STORAGE_KEYS.USER_INFO)
      if (t && !token.value) token.value = t
      if (rt && !refreshToken.value) refreshToken.value = rt
      if (u && !user.value) user.value = u
      if (u) {
        setSentryUser({ id: u.id, riderNo: u.riderNo })
      }
      const ws = getStorage<{ depositPaid: boolean; healthCertExpireAt: string | null }>(
        STORAGE_KEYS.AUTH_EXTRA
      )
      if (ws) {
        depositPaid.value = ws.depositPaid
        healthCertExpireAt.value = ws.healthCertExpireAt
      }
      const duty = getStorage<boolean>(STORAGE_KEYS.WORK_STATUS)
      if (duty !== null) onDuty.value = Boolean(duty)
      setRiderIdProvider(() => user.value?.id ?? null)
    }

    /** 登录成功：写入 token + 资料 */
    function setLogin(payload: {
      accessToken: string
      refreshToken: string
      user: RiderUser
      depositPaid?: boolean
      healthCertExpireAt?: string | null
    }) {
      token.value = payload.accessToken
      refreshToken.value = payload.refreshToken
      user.value = payload.user
      depositPaid.value = payload.depositPaid ?? false
      healthCertExpireAt.value = payload.healthCertExpireAt ?? null
      setStorage(STORAGE_KEYS.TOKEN, payload.accessToken, 1000 * 60 * 60 * 24 * 7)
      setStorage(STORAGE_KEYS.REFRESH_TOKEN, payload.refreshToken, 1000 * 60 * 60 * 24 * 30)
      setStorage(STORAGE_KEYS.USER_INFO, payload.user, 1000 * 60 * 60 * 24 * 30)
      setStorage(
        STORAGE_KEYS.AUTH_EXTRA,
        {
          depositPaid: depositPaid.value,
          healthCertExpireAt: healthCertExpireAt.value
        },
        1000 * 60 * 60 * 24 * 30
      )
      setSentryUser({ id: payload.user.id, riderNo: payload.user.riderNo })
      setRiderIdProvider(() => user.value?.id ?? null)
      logger.info('auth.login', { uid: payload.user.id })
    }

    /** 仅更新用户资料 */
    function setUser(p: RiderUser) {
      user.value = p
      setStorage(STORAGE_KEYS.USER_INFO, p, 1000 * 60 * 60 * 24 * 30)
    }

    /** 仅更新 token */
    function setToken(accessToken: string, refreshTk?: string) {
      token.value = accessToken
      setStorage(STORAGE_KEYS.TOKEN, accessToken, 1000 * 60 * 60 * 24 * 7)
      if (refreshTk) {
        refreshToken.value = refreshTk
        setStorage(STORAGE_KEYS.REFRESH_TOKEN, refreshTk, 1000 * 60 * 60 * 24 * 30)
      }
    }

    /** 标记保证金已交 */
    function setDepositPaid(paid: boolean) {
      depositPaid.value = paid
      setStorage(
        STORAGE_KEYS.AUTH_EXTRA,
        {
          depositPaid: depositPaid.value,
          healthCertExpireAt: healthCertExpireAt.value
        },
        1000 * 60 * 60 * 24 * 30
      )
    }

    /** 更新健康证有效期（资质重审后调用） */
    function setHealthCertExpireAt(expireAt: string | null) {
      healthCertExpireAt.value = expireAt
      setStorage(
        STORAGE_KEYS.AUTH_EXTRA,
        {
          depositPaid: depositPaid.value,
          healthCertExpireAt: healthCertExpireAt.value
        },
        1000 * 60 * 60 * 24 * 30
      )
    }

    /** 切换上下班状态（具体启停定位/WS 由 work store 编排） */
    function setOnDuty(flag: boolean) {
      onDuty.value = flag
      setStorage(STORAGE_KEYS.WORK_STATUS, flag, 1000 * 60 * 60 * 24)
    }

    /** 退出登录：清空所有用户态 */
    async function logout() {
      try {
        await unregisterJPush()
      } catch {
        /* 忽略 */
      }
      token.value = ''
      refreshToken.value = ''
      user.value = null
      depositPaid.value = false
      healthCertExpireAt.value = null
      onDuty.value = false
      removeStorage(STORAGE_KEYS.TOKEN)
      removeStorage(STORAGE_KEYS.REFRESH_TOKEN)
      removeStorage(STORAGE_KEYS.USER_INFO)
      removeStorage(STORAGE_KEYS.WORK_STATUS)
      removeStorage(STORAGE_KEYS.AUTH_EXTRA)
      removeStorage(STORAGE_KEYS.JPUSH_REG_ID)
      try {
        uni.removeStorageSync('o2o_rider_auth')
      } catch {
        /* 忽略 */
      }
      stopWs()
      clearSentryUser()
      setRiderIdProvider(() => null)
      logger.info('auth.logout')
    }

    /** 强制清空所有 storage（仅用于异常恢复） */
    function purge() {
      clearOurStorage()
      token.value = ''
      refreshToken.value = ''
      user.value = null
      depositPaid.value = false
      healthCertExpireAt.value = null
      onDuty.value = false
      try {
        uni.removeStorageSync('o2o_rider_auth')
      } catch {
        /* 忽略 */
      }
      setRiderIdProvider(() => null)
    }

    return {
      token,
      refreshToken,
      user,
      depositPaid,
      healthCertExpireAt,
      onDuty,
      isLoggedIn,
      isApproved,
      canAcceptOrders,
      riderProfile,
      restore,
      setLogin,
      setUser,
      setToken,
      setDepositPaid,
      setHealthCertExpireAt,
      setOnDuty,
      logout,
      purge
    }
  },
  {
    persist: {
      key: 'o2o_rider_auth',
      storage: {
        getItem: (k: string) => uni.getStorageSync(k) as string,
        setItem: (k: string, v: string) => uni.setStorageSync(k, v)
      },
      pick: ['token', 'refreshToken', 'user', 'depositPaid', 'healthCertExpireAt', 'onDuty']
    }
  }
)
