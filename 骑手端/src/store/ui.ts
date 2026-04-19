/**
 * @file store/ui.ts
 * @stage P7/T7.5 (Sprint 1)
 * @desc UI 全局状态：通知 / 铃声 / TTS 设置、loading / dialog 全局态
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { NotifySettings } from '@/types/biz'
import { getStorage, setStorage, STORAGE_KEYS } from '@/utils/storage'

const DEFAULT_NOTIFY: NotifySettings = {
  dispatchTts: 1,
  dispatchRingtone: 1,
  ringtoneVolume: 100,
  ringtoneLoop: 1,
  vibrate: 1
}

export const useUiStore = defineStore('ui', () => {
  const notify = ref<NotifySettings>(
    getStorage<NotifySettings>(STORAGE_KEYS.NOTIFY_SETTINGS) ?? DEFAULT_NOTIFY
  )

  const globalLoading = ref(false)
  const loadingText = ref('')

  function showLoading(text = '加载中...'): void {
    globalLoading.value = true
    loadingText.value = text
  }

  function hideLoading(): void {
    globalLoading.value = false
    loadingText.value = ''
  }

  /** 更新通知设置（部分更新） */
  function setNotify(partial: Partial<NotifySettings>): void {
    notify.value = { ...notify.value, ...partial }
    setStorage(STORAGE_KEYS.NOTIFY_SETTINGS, notify.value)
  }

  return { notify, globalLoading, loadingText, showLoading, hideLoading, setNotify }
})
