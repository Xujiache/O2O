/**
 * APP 配置 store（支付/地图/推送/安全规则等 JSON 可视化）
 *
 * @module store/modules/business/app-config
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { systemApi } from '@/api/business'
import { STORAGE_KEYS, bizGet, bizSet, bizRemove } from '@/utils/business/storage-keys'

export const useBizAppConfigStore = defineStore('bizAppConfig', () => {
  const config = ref<Record<string, unknown>>(
    bizGet<Record<string, unknown>>(STORAGE_KEYS.APP_CONFIG, {})
  )

  const load = async (): Promise<void> => {
    const remote = await systemApi.appConfig()
    config.value = remote
    bizSet(STORAGE_KEYS.APP_CONFIG, remote)
  }

  const update = async (next: Record<string, unknown>): Promise<void> => {
    await systemApi.appConfigUpdate(next)
    config.value = next
    bizSet(STORAGE_KEYS.APP_CONFIG, next)
  }

  const reset = (): void => {
    config.value = {}
    bizRemove(STORAGE_KEYS.APP_CONFIG)
  }

  return { config, load, update, reset }
})
