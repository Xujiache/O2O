/**
 * @file jpush.ts
 * @stage P6/T6.3 (Sprint 1)
 * @desc 极光推送对接：iOS / Android / 小程序 三端 token 注册策略不同
 *
 * 注册流程：
 *   APP（iOS/Android）：plus.push.getClientInfo → POST /merchant/device/register
 *   小程序：getRegisterId 不可用，仅注册 deviceId（用于服务端推送降级到模板消息）
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from './logger'
import { setStorage, getStorage, removeStorage, STORAGE_KEYS } from './storage'
import { post } from './request'

/** plus.push 自定义类型（@dcloudio/types 未声明 getClientInfo/addEventListener 完整签名） */
interface PlusPushCustom {
  getClientInfo: () => { regId?: string; clientid?: string }
  addEventListener: (event: string, handler: (msg: unknown) => void) => void
}

interface PlusDeviceCustom {
  uuid: string
  model: string
}

/** 安全获取 plus 命名空间 */
function getPlus(): { push?: PlusPushCustom; device?: PlusDeviceCustom } | null {
  try {
    const p = (globalThis as { plus?: { push?: PlusPushCustom; device?: PlusDeviceCustom } }).plus
    return p ?? null
  } catch {
    return null
  }
}

/** 设备注册参数 */
export interface DeviceRegisterParams {
  deviceId: string
  /** 平台：1 iOS / 2 Android / 3 小程序 / 4 H5 */
  platform: 1 | 2 | 3 | 4
  /** 极光推送 registrationId（小程序为空） */
  jpushRegId?: string
  appVersion?: string
  osVersion?: string
  deviceModel?: string
}

/** 检测当前运行平台 */
function detectPlatform(): 1 | 2 | 3 | 4 {
  /* APP-PLUS：plus 全局存在 */
  if (getPlus()) {
    try {
      const sys = uni.getSystemInfoSync()
      return sys.platform === 'ios' ? 1 : 2
    } catch {
      return 2
    }
  }
  /* 小程序 */
  if (typeof wx !== 'undefined') return 3
  return 4
}

/** 获取或生成设备 ID（持久化） */
function getOrCreateDeviceId(): string {
  const cached = getStorage<string>('o2o_mchnt_device_id')
  if (cached) return cached
  let deviceId = ''
  try {
    const p = getPlus()
    if (p?.device?.uuid) deviceId = p.device.uuid
  } catch (e) {
    logger.warn('jpush.deviceId.uuid.fail', { e: String(e) })
  }
  if (!deviceId) {
    deviceId = `mc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
  setStorage('o2o_mchnt_device_id', deviceId, 1000 * 60 * 60 * 24 * 365)
  return deviceId
}

/** 获取极光推送 RegistrationId */
function getJPushRegId(): Promise<string> {
  return new Promise((resolve) => {
    try {
      const p = getPlus()
      if (p?.push?.getClientInfo) {
        const info = p.push.getClientInfo()
        resolve(info.regId ?? info.clientid ?? '')
        return
      }
    } catch (e) {
      logger.warn('jpush.regId.fail', { e: String(e) })
    }
    resolve('')
  })
}

/**
 * 注册当前设备到后端（登录成功后调用）
 * @returns 注册成功返回 registrationId
 */
export async function registerJPush(): Promise<string> {
  try {
    const deviceId = getOrCreateDeviceId()
    const platform = detectPlatform()
    const jpushRegId = await getJPushRegId()
    const sys = uni.getSystemInfoSync()
    const env = (import.meta as unknown as { env?: Record<string, string> }).env
    const params: DeviceRegisterParams = {
      deviceId,
      platform,
      jpushRegId,
      appVersion: env?.VITE_APP_VERSION ?? '0.1.0',
      osVersion: sys.system,
      deviceModel: sys.model
    }
    await post('/merchant/device/register', params, { silent: true, retry: 1 })
    setStorage(STORAGE_KEYS.JPUSH_REG_ID, jpushRegId)
    logger.info('jpush.register.ok', { platform, hasRegId: Boolean(jpushRegId) })
    return jpushRegId
  } catch (e) {
    logger.warn('jpush.register.fail', { e: String(e) })
    return ''
  }
}

/** 注销当前设备 */
export async function unregisterJPush(): Promise<void> {
  try {
    const deviceId = getStorage<string>('o2o_mchnt_device_id')
    if (!deviceId) return
    await post('/merchant/device/unregister', { deviceId }, { silent: true, retry: 1 })
    removeStorage(STORAGE_KEYS.JPUSH_REG_ID)
    logger.info('jpush.unregister.ok')
  } catch (e) {
    logger.warn('jpush.unregister.fail', { e: String(e) })
  }
}

/**
 * 监听极光推送通知点击（APP 端）
 * 用途：用户点击通知栏 → 跳转对应订单详情
 */
export function onJPushNotificationClick(
  onClick: (payload: Record<string, unknown>) => void
): void {
  try {
    const p = getPlus()
    if (!p?.push?.addEventListener) return
    p.push.addEventListener('click', (msg: unknown) => {
      const m = msg as { payload?: Record<string, unknown> }
      onClick(m.payload ?? {})
    })
  } catch (e) {
    logger.warn('jpush.listen.fail', { e: String(e) })
  }
}
