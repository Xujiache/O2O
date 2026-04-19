/**
 * @file store/printer.ts
 * @stage P6/T6.4 (Sprint 1)
 * @desc 打印机 Store：已连接设备、状态、打印队列长度
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PrinterDevice, PrinterState } from '@/utils/bluetooth-printer'
import { getStorage, setStorage, removeStorage, STORAGE_KEYS } from '@/utils/storage'

/** 打印机 Store */
export const usePrinterStore = defineStore(
  'printer',
  () => {
    /** 已绑定的打印机设备（持久化） */
    const device = ref<PrinterDevice | null>(null)
    /** 打印机连接状态 */
    const state = ref<PrinterState>('disconnected')
    /** 打印机自动连接开关 */
    const autoConnect = ref<boolean>(true)
    /** 打印机参数：纸宽 */
    const paperWidth = ref<58 | 80>(58)
    /** 是否启用自动打印（新订单接单后自动打） */
    const autoPrint = ref<boolean>(true)
    /** 打印份数 */
    const copies = ref<number>(1)

    /** 启动时恢复 */
    function restore() {
      const d = getStorage<PrinterDevice>(STORAGE_KEYS.PRINTER_DEVICE)
      if (d) device.value = d
    }

    function setDevice(d: PrinterDevice | null) {
      device.value = d
      if (d) setStorage(STORAGE_KEYS.PRINTER_DEVICE, d, 1000 * 60 * 60 * 24 * 365)
      else removeStorage(STORAGE_KEYS.PRINTER_DEVICE)
    }

    function setState(s: PrinterState) {
      state.value = s
    }

    return {
      device,
      state,
      autoConnect,
      paperWidth,
      autoPrint,
      copies,
      restore,
      setDevice,
      setState
    }
  },
  {
    persist: {
      key: 'o2o_mchnt_printer',
      storage: {
        getItem: (k: string) => uni.getStorageSync(k) as string,
        setItem: (k: string, v: string) => uni.setStorageSync(k, v)
      },
      pick: ['autoConnect', 'paperWidth', 'autoPrint', 'copies']
    }
  }
)
