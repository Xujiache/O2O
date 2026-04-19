/**
 * @file store/notify.ts
 * @stage P6/T6.4 (Sprint 1) + T6.39 (Sprint 5)
 * @desc 通知/语音/铃声配置 Store（持久化）
 *
 * 设置项：
 *   - newOrderTts        新订单语音播报开关
 *   - newOrderRingtone   新订单铃声开关
 *   - ringtoneVolume     铃声音量 0-100
 *   - ringtoneLoop       铃声循环
 *   - autoAccept         自动接单
 *   - autoAcceptCountdown 自动接单倒计时（秒）
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { NotifySettings } from '@/types/biz'

const DEFAULT_SETTINGS: NotifySettings = {
  newOrderTts: 1,
  newOrderRingtone: 1,
  ringtoneVolume: 80,
  ringtoneLoop: 1,
  autoAccept: 0,
  autoAcceptCountdown: 5
}

export const useNotifySettingsStore = defineStore(
  'notify',
  () => {
    const settings = ref<NotifySettings>({ ...DEFAULT_SETTINGS })

    function update(patch: Partial<NotifySettings>) {
      settings.value = { ...settings.value, ...patch }
    }

    function reset() {
      settings.value = { ...DEFAULT_SETTINGS }
    }

    return { settings, update, reset }
  },
  {
    persist: {
      key: 'o2o_mchnt_notify',
      storage: {
        getItem: (k: string) => uni.getStorageSync(k) as string,
        setItem: (k: string, v: string) => uni.setStorageSync(k, v)
      },
      pick: ['settings']
    }
  }
)
