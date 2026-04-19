/**
 * @file store/user.ts
 * @stage P5/T5.5 (Sprint 1)
 * @desc 用户态 Store：token、用户资料、登录态、退出
 * @author 单 Agent V2.0
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo } from '@/types/biz'
import {
  getStorage,
  setStorage,
  removeStorage,
  clearOurStorage,
  STORAGE_KEYS
} from '@/utils/storage'
import { stopWs } from '@/utils/ws'
import { logger } from '@/utils/logger'

/**
 * 用户 Store（P5-REVIEW-01 R1 / I-04：挂载 persistedstate 插件）
 *
 * 持久化字段：token / refreshToken / profile（pick 选项白名单）
 * 存储引擎：uni.getStorageSync / uni.setStorageSync（与 app.ts 一致）
 *
 * 兼容设计：保留 restore() 方法作为 P3/P4 兼容兜底，App.vue onLaunch 仍调用一次
 * 实际由 pinia-plugin-persistedstate 自动从同一存储 key 恢复，restore() 二次覆盖等价
 */
export const useUserStore = defineStore(
  'user',
  () => {
    const token = ref<string>('')
    const refreshToken = ref<string>('')
    const profile = ref<UserInfo | null>(null)
    const isLogin = computed<boolean>(() => Boolean(token.value && profile.value))

    /**
     * 启动时从本地存储恢复（P3/P4 既有 STORAGE_KEYS 兼容）
     * 注：persistedstate 插件已自动从 'o2o_user' key 恢复 token/refreshToken/profile
     *     本方法保留作为双保险，避免老安装包升级时丢登录态
     */
    function restore() {
      const t = getStorage<string>(STORAGE_KEYS.TOKEN)
      const rt = getStorage<string>(STORAGE_KEYS.REFRESH_TOKEN)
      const p = getStorage<UserInfo>(STORAGE_KEYS.USER_INFO)
      if (t && !token.value) token.value = t
      if (rt && !refreshToken.value) refreshToken.value = rt
      if (p && !profile.value) profile.value = p
    }

    /** 登录成功：写入 token + 资料 */
    function setLogin(payload: { accessToken: string; refreshToken: string; user: UserInfo }) {
      token.value = payload.accessToken
      refreshToken.value = payload.refreshToken
      profile.value = payload.user
      setStorage(STORAGE_KEYS.TOKEN, payload.accessToken, 1000 * 60 * 60 * 24 * 7)
      setStorage(STORAGE_KEYS.REFRESH_TOKEN, payload.refreshToken, 1000 * 60 * 60 * 24 * 30)
      setStorage(STORAGE_KEYS.USER_INFO, payload.user, 1000 * 60 * 60 * 24 * 30)
      logger.info('user.login', { uid: payload.user.id })
    }

    /** 仅更新用户资料（编辑后） */
    function setProfile(p: UserInfo) {
      profile.value = p
      setStorage(STORAGE_KEYS.USER_INFO, p, 1000 * 60 * 60 * 24 * 30)
    }

    /** 仅更新 token（refresh 后） */
    function setToken(accessToken: string, refreshTk?: string) {
      token.value = accessToken
      setStorage(STORAGE_KEYS.TOKEN, accessToken, 1000 * 60 * 60 * 24 * 7)
      if (refreshTk) {
        refreshToken.value = refreshTk
        setStorage(STORAGE_KEYS.REFRESH_TOKEN, refreshTk, 1000 * 60 * 60 * 24 * 30)
      }
    }

    /** 退出登录：清空所有用户态 */
    function logout() {
      token.value = ''
      refreshToken.value = ''
      profile.value = null
      removeStorage(STORAGE_KEYS.TOKEN)
      removeStorage(STORAGE_KEYS.REFRESH_TOKEN)
      removeStorage(STORAGE_KEYS.USER_INFO)
      /* 同步清掉 persistedstate 自身存储 key（防止下次启动被插件恢复回来） */
      try {
        uni.removeStorageSync('o2o_user')
      } catch {
        /* 忽略：H5 或非 uni 环境下不抛 */
      }
      stopWs()
      logger.info('user.logout')
    }

    /** 强制清空（异常场景） */
    function purge() {
      clearOurStorage()
      token.value = ''
      refreshToken.value = ''
      profile.value = null
      try {
        uni.removeStorageSync('o2o_user')
      } catch {
        /* 忽略 */
      }
    }

    return {
      token,
      refreshToken,
      profile,
      isLogin,
      restore,
      setLogin,
      setProfile,
      setToken,
      logout,
      purge
    }
  },
  {
    persist: {
      key: 'o2o_user',
      storage: {
        getItem: (k: string) => uni.getStorageSync(k) as string,
        setItem: (k: string, v: string) => uni.setStorageSync(k, v)
      },
      pick: ['token', 'refreshToken', 'profile']
    }
  }
)
