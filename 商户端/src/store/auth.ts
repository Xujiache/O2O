/**
 * @file store/auth.ts
 * @stage P6/T6.4 (Sprint 1)
 * @desc 商户端认证 Store：token、用户资料、权限码、菜单
 *
 * P5 经验：必须使用 pinia-plugin-persistedstate 持久化关键字段
 *   pick: token / refreshToken / profile / permissions / menus
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MerchantUser, MerchantMenu } from '@/types/biz'
import {
  getStorage,
  setStorage,
  removeStorage,
  clearOurStorage,
  STORAGE_KEYS
} from '@/utils/storage'
import { setPermissions } from '@/utils/permission'
import { stopWs } from '@/utils/ws'
import { unregisterJPush } from '@/utils/jpush'
import { clearSentryUser } from '@/utils/sentry'
import { logger } from '@/utils/logger'

/** 商户认证 Store */
export const useAuthStore = defineStore(
  'auth',
  () => {
    const token = ref<string>('')
    const refreshToken = ref<string>('')
    const profile = ref<MerchantUser | null>(null)
    const permissions = ref<string[]>([])
    const menus = ref<MerchantMenu[]>([])

    /** 是否已登录 */
    const isLogin = computed<boolean>(() => Boolean(token.value && profile.value))
    /** 是否主账号 */
    const isMaster = computed<boolean>(() => profile.value?.accountType === 1)
    /** 是否审核通过 */
    const isAudited = computed<boolean>(() => profile.value?.status === 1)

    /** 启动时从本地存储恢复（双保险，与 persistedstate 配合） */
    function restore() {
      const t = getStorage<string>(STORAGE_KEYS.TOKEN)
      const rt = getStorage<string>(STORAGE_KEYS.REFRESH_TOKEN)
      const p = getStorage<MerchantUser>(STORAGE_KEYS.USER_INFO)
      const pm = getStorage<string[]>(STORAGE_KEYS.PERMISSIONS)
      if (t && !token.value) token.value = t
      if (rt && !refreshToken.value) refreshToken.value = rt
      if (p && !profile.value) profile.value = p
      if (pm && pm.length > 0 && permissions.value.length === 0) permissions.value = pm
    }

    /** 登录成功：写入 token + 资料 + 权限 */
    function setLogin(payload: {
      accessToken: string
      refreshToken: string
      user: MerchantUser
      permissions?: string[]
      menus?: MerchantMenu[]
    }) {
      token.value = payload.accessToken
      refreshToken.value = payload.refreshToken
      profile.value = payload.user
      permissions.value = payload.permissions ?? []
      menus.value = payload.menus ?? []
      setStorage(STORAGE_KEYS.TOKEN, payload.accessToken, 1000 * 60 * 60 * 24 * 7)
      setStorage(STORAGE_KEYS.REFRESH_TOKEN, payload.refreshToken, 1000 * 60 * 60 * 24 * 30)
      setStorage(STORAGE_KEYS.USER_INFO, payload.user, 1000 * 60 * 60 * 24 * 30)
      if (payload.permissions) setPermissions(payload.permissions)
      logger.info('auth.login', { uid: payload.user.id, role: payload.user.staffRole ?? 'master' })
    }

    /** 仅更新用户资料 */
    function setProfile(p: MerchantUser) {
      profile.value = p
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

    /** 更新权限与菜单 */
    function setPermsAndMenus(perms: string[], m: MerchantMenu[]) {
      permissions.value = perms
      menus.value = m
      setPermissions(perms)
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
      profile.value = null
      permissions.value = []
      menus.value = []
      removeStorage(STORAGE_KEYS.TOKEN)
      removeStorage(STORAGE_KEYS.REFRESH_TOKEN)
      removeStorage(STORAGE_KEYS.USER_INFO)
      removeStorage(STORAGE_KEYS.PERMISSIONS)
      removeStorage(STORAGE_KEYS.JPUSH_REG_ID)
      try {
        uni.removeStorageSync('o2o_mchnt_auth')
      } catch {
        /* 忽略 */
      }
      stopWs()
      clearSentryUser()
      logger.info('auth.logout')
    }

    /** 强制清空 */
    function purge() {
      clearOurStorage()
      token.value = ''
      refreshToken.value = ''
      profile.value = null
      permissions.value = []
      menus.value = []
      try {
        uni.removeStorageSync('o2o_mchnt_auth')
      } catch {
        /* 忽略 */
      }
    }

    return {
      token,
      refreshToken,
      profile,
      permissions,
      menus,
      isLogin,
      isMaster,
      isAudited,
      restore,
      setLogin,
      setProfile,
      setToken,
      setPermsAndMenus,
      logout,
      purge
    }
  },
  {
    persist: {
      key: 'o2o_mchnt_auth',
      storage: {
        getItem: (k: string) => uni.getStorageSync(k) as string,
        setItem: (k: string, v: string) => uni.setStorageSync(k, v)
      },
      pick: ['token', 'refreshToken', 'profile', 'permissions', 'menus']
    }
  }
)
