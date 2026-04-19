/**
 * 业务权限 store：菜单 + 权限码 + 角色
 *
 * 登录后调用 load() 拉取
 * 权限码用于 v-auth 指令 + 路由守卫 + 菜单过滤
 *
 * @module store/modules/business/perm
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { systemApi } from '@/api/business'
import type { BizMenu } from '@/types/business'
import { STORAGE_KEYS, bizGet, bizSet, bizRemove } from '@/utils/business/storage-keys'

export const useBizPermStore = defineStore('bizPerm', () => {
  const menus = ref<BizMenu[]>(bizGet<BizMenu[]>(STORAGE_KEYS.PERM_MENUS, []))
  const codes = ref<string[]>(bizGet<string[]>(STORAGE_KEYS.PERM_CODES, []))
  const roles = ref<string[]>(bizGet<string[]>(STORAGE_KEYS.PERM_ROLES, []))
  const codeSet = computed(() => new Set(codes.value))
  const roleSet = computed(() => new Set(roles.value))

  /**
   * 是否拥有某权限码
   */
  const has = (code: string): boolean => {
    if (!code) return true
    if (roleSet.value.has('R_SUPER')) return true
    return codeSet.value.has(code)
  }

  /**
   * 是否拥有任一权限码
   */
  const hasAny = (codes: string[]): boolean => codes.some((c) => has(c))

  /**
   * 是否拥有全部权限码
   */
  const hasAll = (codes: string[]): boolean => codes.every((c) => has(c))

  const isRole = (role: string): boolean => roleSet.value.has(role)

  /**
   * 加载权限（登录后调用）
   */
  const load = async (): Promise<void> => {
    const data = await systemApi.permissions()
    menus.value = data.menus || []
    codes.value = data.permissions || []
    roles.value = data.roles || []
    bizSet(STORAGE_KEYS.PERM_MENUS, menus.value)
    bizSet(STORAGE_KEYS.PERM_CODES, codes.value)
    bizSet(STORAGE_KEYS.PERM_ROLES, roles.value)
  }

  const reset = (): void => {
    menus.value = []
    codes.value = []
    roles.value = []
    bizRemove(STORAGE_KEYS.PERM_MENUS)
    bizRemove(STORAGE_KEYS.PERM_CODES)
    bizRemove(STORAGE_KEYS.PERM_ROLES)
  }

  return { menus, codes, roles, codeSet, roleSet, has, hasAny, hasAll, isRole, load, reset }
})
