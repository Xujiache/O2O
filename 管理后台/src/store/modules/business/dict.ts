/**
 * 业务字典 store
 *
 * 登录后拉一次全量字典缓存到 localStorage（5min TTL）
 * BizStatus 组件按 type + code 查询
 *
 * @module store/modules/business/dict
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { systemApi } from '@/api/business'
import type { DictGroup, DictItem } from '@/types/business'
import { STORAGE_KEYS, bizGet, bizSet, bizRemove } from '@/utils/business/storage-keys'

const TTL_MS = 5 * 60 * 1000

export const useBizDictStore = defineStore('bizDict', () => {
  const groups = ref<DictGroup[]>([])
  const ts = ref<number>(0)

  const map = computed(() => {
    const m: Record<string, DictGroup> = {}
    groups.value.forEach((g) => {
      m[g.type] = g
    })
    return m
  })

  /**
   * 获取字典项的中文标签
   */
  const getLabel = (type: string, code: string | number): string => {
    const g = map.value[type]
    if (!g) return String(code)
    const item = g.items.find(
      (it) => String(it.code) === String(code) || String(it.value) === String(code)
    )
    return item?.label ?? String(code)
  }

  /**
   * 获取字典项数组
   */
  const getItems = (type: string): DictItem[] => map.value[type]?.items ?? []

  /**
   * 加载字典（带 5min TTL，避免重复请求）
   */
  const load = async (force = false): Promise<void> => {
    if (!force) {
      const cached = bizGet<DictGroup[] | null>(STORAGE_KEYS.DICT_CACHE, null)
      const cachedTs = bizGet<number>(STORAGE_KEYS.DICT_CACHE_TS, 0)
      if (cached && Array.isArray(cached) && Date.now() - cachedTs < TTL_MS) {
        groups.value = cached
        ts.value = cachedTs
        return
      }
    }
    const remote = await systemApi.dictAll()
    groups.value = remote
    ts.value = Date.now()
    bizSet(STORAGE_KEYS.DICT_CACHE, remote)
    bizSet(STORAGE_KEYS.DICT_CACHE_TS, ts.value)
  }

  const reset = (): void => {
    groups.value = []
    ts.value = 0
    bizRemove(STORAGE_KEYS.DICT_CACHE)
    bizRemove(STORAGE_KEYS.DICT_CACHE_TS)
  }

  return { groups, ts, map, getLabel, getItems, load, reset }
})
