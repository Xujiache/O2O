/**
 * @file store/ui.ts
 * @stage P6/T6.4 (Sprint 1)
 * @desc UI 全局态：loading 计数、底部 tab 红点
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const loadingCount = ref<number>(0)
  const isLoading = computed<boolean>(() => loadingCount.value > 0)

  function startLoading() {
    loadingCount.value += 1
  }
  function stopLoading() {
    loadingCount.value = Math.max(0, loadingCount.value - 1)
  }
  function resetLoading() {
    loadingCount.value = 0
  }

  return { loadingCount, isLoading, startLoading, stopLoading, resetLoading }
})
