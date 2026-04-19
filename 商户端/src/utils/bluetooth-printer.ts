/**
 * @file bluetooth-printer.ts
 * @stage P6/T6.40 (Sprint 6) + P6-R1 (I-01/I-02)
 * @desc 蓝牙小票打印封装（ESC/POS）
 *
 * 协议：ESC/POS（58mm 32 字符宽 / 80mm 48 字符宽）
 * 平台：仅 APP 端（iOS / Android）；小程序版完全跳过
 * 状态机：disconnected → connecting → connected → printing → error
 *
 * R1 修复：
 *   - I-01：connect() 后真实 getBLEDeviceServices + getBLEDeviceCharacteristics 查找可写
 *           特征值；任一步失败 state='error' + reject；8s 超时守卫
 *   - I-02：doPrint() 拆出 writeOnce()，按 task.copies 循环写入（默认 1 张）
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from './logger'
import type { MerchantOrder } from '@/types/biz'
import { renderOrderReceipt } from './escpos'

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
  /** 联次数（厨房/配送/客户）；每次 doPrint 内按此值循环写入 */
  copies: number
  retry: number
  /** 1 厨房联 / 2 配送联 / 3 客户联 */
  copyType: 1 | 2 | 3
}

/** 检测当前是否支持蓝牙打印（仅 APP 端） */
function isBluetoothSupported(): boolean {
  return typeof plus !== 'undefined' && Boolean(plus)
}

/** 连接 + 服务/特征值查找超时（毫秒） */
const CONNECT_DISCOVER_TIMEOUT_MS = 8000
/** 多份打印之间的间隔（避免缓冲溢出） */
const PRINT_COPY_INTERVAL_MS = 200

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

  /**
   * 连接打印机（R1 / I-01）
   *
   * 流程：
   *   1. createBLEConnection
   *   2. getBLEDeviceServices → 找首个 isPrimary 的 service
   *   3. getBLEDeviceCharacteristics → 找首个 properties.write===true || writeNoResponse===true 的 characteristic
   *   4. 全部赋值后 state='connected'；任一步失败 state='error' + reject
   *   5. 8s 总超时守卫
   */
  connect(device: PrinterDevice): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!isBluetoothSupported()) {
        reject(new Error('蓝牙打印仅 APP 端支持'))
        return
      }
      this.state = 'connecting'

      let settled = false
      const finish = (err?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutHandle)
        if (err) {
          this.state = 'error'
          reject(err)
        } else {
          this.device = device
          this.state = 'connected'
          logger.info('printer.connected', {
            name: device.name,
            serviceId: this.serviceId,
            characteristicId: this.characteristicId
          })
          resolve()
        }
      }

      const timeoutHandle = setTimeout(
        () => finish(new Error('蓝牙连接超时（8s）')),
        CONNECT_DISCOVER_TIMEOUT_MS
      )

      uni.createBLEConnection({
        deviceId: device.deviceId,
        success: () => {
          /* 步骤 2：发现 services */
          uni.getBLEDeviceServices({
            deviceId: device.deviceId,
            success: (svcRes) => {
              const services = (svcRes.services ?? []) as Array<{
                uuid: string
                isPrimary?: boolean
              }>
              if (services.length === 0) {
                finish(new Error('未发现蓝牙 service'))
                return
              }
              const primary = services.find((s) => s.isPrimary) ?? services[0]
              const targetServiceId = primary.uuid
              /* 步骤 3：发现 characteristics */
              uni.getBLEDeviceCharacteristics({
                deviceId: device.deviceId,
                serviceId: targetServiceId,
                success: (chRes) => {
                  const chs = (chRes.characteristics ?? []) as Array<{
                    uuid: string
                    properties?: { write?: boolean; writeNoResponse?: boolean }
                  }>
                  const writable = chs.find(
                    (c) => c.properties?.write === true || c.properties?.writeNoResponse === true
                  )
                  if (!writable) {
                    finish(new Error('未发现可写 characteristic'))
                    return
                  }
                  this.serviceId = targetServiceId
                  this.characteristicId = writable.uuid
                  finish()
                },
                fail: (e) => finish(new Error(e.errMsg ?? '获取特征值失败'))
              })
            },
            fail: (e) => finish(new Error(e.errMsg ?? '获取 service 失败'))
          })
        },
        fail: (e) => finish(new Error(e.errMsg ?? '蓝牙连接失败'))
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
        this.serviceId = ''
        this.characteristicId = ''
        resolve()
        return
      }
      uni.closeBLEConnection({
        deviceId: this.device.deviceId,
        complete: () => {
          this.state = 'disconnected'
          this.device = null
          this.serviceId = ''
          this.characteristicId = ''
          logger.info('printer.disconnected')
          resolve()
        }
      })
    })
  }

  /** 打印订单（入队） */
  enqueue(task: PrintTask): void {
    this.queue.push(task)
    logger.info('printer.enqueue', {
      id: task.id,
      copies: task.copies,
      queueLen: this.queue.length
    })
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
        logger.info('printer.print.ok', { id: task.id, copies: task.copies })
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

  /**
   * 打印一个任务（R1 / I-02）
   *
   * 按 task.copies 循环 writeOnce()；每次之间间隔 PRINT_COPY_INTERVAL_MS 避免缓冲溢出。
   * copies=10 → 触发 10 次 writeOnce，对应 V6.13 批量打印 10 张验收。
   */
  private async doPrint(task: PrintTask): Promise<void> {
    if (this.state !== 'connected' || !this.device) {
      throw new Error('打印机未连接')
    }
    const copies = Math.max(1, task.copies)
    this.state = 'printing'
    const buffer = this.buildEscPosBuffer(task)
    try {
      for (let i = 0; i < copies; i++) {
        await this.writeOnce(buffer)
        if (i < copies - 1) {
          await new Promise((r) => setTimeout(r, PRINT_COPY_INTERVAL_MS))
        }
      }
      this.state = 'connected'
    } catch (e) {
      this.state = 'error'
      throw e
    }
  }

  /**
   * 单次写入（R1 / I-02 抽出）
   *
   * 调用前断言 serviceId/characteristicId 已就绪（防止 connect 中途异常未赋值）
   */
  private writeOnce(buffer: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.device) {
        reject(new Error('打印机未连接'))
        return
      }
      if (!this.serviceId || !this.characteristicId) {
        reject(new Error('蓝牙特征值未就绪'))
        return
      }
      if (!isBluetoothSupported()) {
        /* 非 APP 端走假设成功，便于 H5 / 小程序联调 */
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
        success: () => resolve(),
        fail: (e) => reject(new Error(e.errMsg ?? '写入失败'))
      })
    })
  }

  /**
   * 构造 ESC/POS 字节流（S6 完整实现）
   * 模板见 escpos.ts → renderOrderReceipt
   */
  private buildEscPosBuffer(task: PrintTask): ArrayBuffer {
    const paperWidth = (this.device?.paperWidth ?? 58) as 58 | 80
    return renderOrderReceipt(task.order, paperWidth, task.copyType)
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
