/**
 * @file bluetooth-printer.ts
 * @stage P6/T6.40 (Sprint 6)
 * @desc 蓝牙小票打印封装（ESC/POS）
 *
 * 协议：ESC/POS（58mm 32 字符宽 / 80mm 48 字符宽）
 * 平台：仅 APP 端（iOS / Android）；小程序版完全跳过
 * 状态机：disconnected → connecting → connected → printing → error
 *
 * P6 范围：
 *   - 暴露 BluetoothPrinter 单例 + 全部接口
 *   - 真实 ESC/POS 模板与多机并发归 S6 / T6.40 详细实现
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from './logger'
import type { MerchantOrder } from '@/types/biz'

/** 打印机状态 */
export type PrinterState = 'disconnected' | 'connecting' | 'connected' | 'printing' | 'error'

/** 已发现的蓝牙设备 */
export interface PrinterDevice {
  deviceId: string
  name: string
  RSSI?: number
  /** 58 / 80 mm */
  paperWidth?: 58 | 80
}

/** 打印任务（FIFO 队列） */
export interface PrintTask {
  id: string
  order: MerchantOrder
  copies: number
  retry: number
  /** 1 厨房联 / 2 配送联 / 3 客户联 */
  copyType: 1 | 2 | 3
}

/** 检测当前是否支持蓝牙打印（仅 APP 端） */
function isBluetoothSupported(): boolean {
  return typeof plus !== 'undefined' && Boolean(plus)
}

class BluetoothPrinter {
  private state: PrinterState = 'disconnected'
  private device: PrinterDevice | null = null
  private serviceId = ''
  private characteristicId = ''
  private queue: PrintTask[] = []
  private processing = false
  private maxRetry = 3

  /** 当前状态 */
  getState(): PrinterState {
    return this.state
  }

  /** 当前设备 */
  getDevice(): PrinterDevice | null {
    return this.device
  }

  /**
   * 扫描附近蓝牙设备
   * @param timeoutMs 超时（默认 8s）
   * @returns 发现的设备列表（按 RSSI 排序）
   */
  scan(timeoutMs = 8000): Promise<PrinterDevice[]> {
    return new Promise((resolve, reject) => {
      if (!isBluetoothSupported()) {
        reject(new Error('蓝牙打印仅 APP 端支持'))
        return
      }
      const found: Map<string, PrinterDevice> = new Map()
      uni.openBluetoothAdapter({
        success: () => {
          uni.startBluetoothDevicesDiscovery({
            allowDuplicatesKey: false,
            success: () => {
              uni.onBluetoothDeviceFound((res) => {
                for (const d of res.devices) {
                  if (!d.name) continue
                  found.set(d.deviceId, {
                    deviceId: d.deviceId,
                    name: d.name,
                    RSSI: d.RSSI
                  })
                }
              })
              setTimeout(() => {
                uni.stopBluetoothDevicesDiscovery({})
                const list = Array.from(found.values()).sort(
                  (a, b) => (b.RSSI ?? -100) - (a.RSSI ?? -100)
                )
                resolve(list)
              }, timeoutMs)
            },
            fail: (e) => {
              reject(new Error(e.errMsg ?? '蓝牙扫描失败'))
            }
          })
        },
        fail: (e) => {
          reject(new Error(e.errMsg ?? '蓝牙未开启'))
        }
      })
    })
  }

  /** 连接打印机 */
  connect(device: PrinterDevice): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!isBluetoothSupported()) {
        reject(new Error('蓝牙打印仅 APP 端支持'))
        return
      }
      this.state = 'connecting'
      uni.createBLEConnection({
        deviceId: device.deviceId,
        success: () => {
          this.device = device
          this.state = 'connected'
          logger.info('printer.connected', { name: device.name })
          /* 简化：实际需 getBLEDeviceServices + getBLEDeviceCharacteristics 找可写特征值 */
          resolve()
        },
        fail: (e) => {
          this.state = 'error'
          reject(new Error(e.errMsg ?? '蓝牙连接失败'))
        }
      })
    })
  }

  /** 断开连接 */
  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.device) {
        resolve()
        return
      }
      if (!isBluetoothSupported()) {
        this.state = 'disconnected'
        this.device = null
        resolve()
        return
      }
      uni.closeBLEConnection({
        deviceId: this.device.deviceId,
        complete: () => {
          this.state = 'disconnected'
          this.device = null
          logger.info('printer.disconnected')
          resolve()
        }
      })
    })
  }

  /** 打印订单（入队） */
  enqueue(task: PrintTask): void {
    this.queue.push(task)
    logger.info('printer.enqueue', { id: task.id, queueLen: this.queue.length })
    if (!this.processing) {
      void this.processQueue()
    }
  }

  /** 处理队列（FIFO + 失败重试） */
  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true
    while (this.queue.length > 0) {
      const task = this.queue.shift()
      if (!task) break
      try {
        await this.doPrint(task)
        logger.info('printer.print.ok', { id: task.id })
      } catch (e) {
        logger.warn('printer.print.fail', { id: task.id, retry: task.retry, e: String(e) })
        if (task.retry < this.maxRetry) {
          task.retry += 1
          this.queue.unshift(task)
          await new Promise((r) => setTimeout(r, 1000 * 2 ** task.retry))
        }
      }
    }
    this.processing = false
  }

  /** 真正打印（ESC/POS 指令封装） */
  private doPrint(task: PrintTask): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state !== 'connected' || !this.device) {
        reject(new Error('打印机未连接'))
        return
      }
      this.state = 'printing'
      const buffer = this.buildEscPosBuffer(task)
      if (!isBluetoothSupported()) {
        this.state = 'connected'
        resolve()
        return
      }
      /* uni-app 在 mp-weixin 下 value 类型实际允许 ArrayBuffer，
         但 @dcloudio/types 错误标注为 any[]；通过 unknown 中转兼容 */
      uni.writeBLECharacteristicValue({
        deviceId: this.device.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.characteristicId,
        value: buffer as unknown as ArrayBuffer & number[],
        success: () => {
          this.state = 'connected'
          resolve()
        },
        fail: (e) => {
          this.state = 'error'
          reject(new Error(e.errMsg ?? '写入失败'))
        }
      })
    })
  }

  /**
   * 构造 ESC/POS 字节流（简化版；S6 阶段完整实现）
   * 模板：店铺名 / 订单号 / 下单时间 / 商品列表 / 备注 / 配送地址 / 总计
   */
  private buildEscPosBuffer(task: PrintTask): ArrayBuffer {
    /* 简化骨架：返回空 buffer；S6 阶段补完整 ESC/POS 模板 */
    const text = `店铺：${task.order.shopName}\n订单：${task.order.orderNo}\n金额：${task.order.payAmount}\n`
    return new TextEncoder().encode(text).buffer as ArrayBuffer
  }
}

/** 全局单例 */
export const printer = new BluetoothPrinter()

/** 从订单创建打印任务 */
export function createPrintTask(
  order: MerchantOrder,
  opt: { copies?: number; copyType?: 1 | 2 | 3 } = {}
): PrintTask {
  return {
    id: `${order.orderNo}-${opt.copyType ?? 1}-${Date.now()}`,
    order,
    copies: opt.copies ?? 1,
    retry: 0,
    copyType: opt.copyType ?? 1
  }
}
