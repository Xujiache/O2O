/**
 * @file jpush.ts
 * @stage P7/T7.3 (Sprint 1)
 * @desc 极光推送对接：iOS / Android 两端 token 注册策略
 *
 * 注册流程：
 *   APP（iOS/Android）：plus.push.getClientInfo → POST /rider/device/register
 *   骑手端不发布小程序，故无小程序分支
 *
 * P6-R1 / I-05 经验：所有硬编码 storage key 已抽到 STORAGE_KEYS（DEVICE_ID）
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { logger } from './logger'
import { setStorage, getStorage, removeStorage, STORAGE_KEYS } from './storage'
import { post } from './request'

/** plus.push 自定义类型（@dcloudio/types 未声明完整签名） */
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
  /** 平台：1 iOS / 2 Android / 4 H5 (骑手端无 wx 小程序) */
  platform: 1 | 2 | 4
  /** 极光推送 registrationId */
  jpushRegId?: string
  appVersion?: string
  osVersion?: string
  deviceModel?: string
}

/** 检测当前运行平台 */
function detectPlatform(): 1 | 2 | 4 {
  if (getPlus()) {
    try {
      const sys = uni.getSystemInfoSync()
      return sys.platform === 'ios' ? 1 : 2
    } catch {
      return 2
    }
  }
  return 4
}

/** 获取或生成设备 ID（持久化） */
function getOrCreateDeviceId(): string {
  const cached = getStorage<string>(STORAGE_KEYS.DEVICE_ID)
  if (cached) return cached
  let deviceId = ''
  try {
    const p = getPlus()
    if (p?.device?.uuid) deviceId = p.device.uuid
  } catch (e) {
    logger.warn('jpush.deviceId.uuid.fail', { e: String(e) })
  }
  if (!deviceId) {
    deviceId = `rd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
  setStorage(STORAGE_KEYS.DEVICE_ID, deviceId, 1000 * 60 * 60 * 24 * 365)
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
    await post('/rider/device/register', params, { silent: true, retry: 1 })
    setStorage(STORAGE_KEYS.JPUSH_REG_ID, jpushRegId)
    logger.info('jpush.register.ok', { platform, hasRegId: Boolean(jpushRegId) })
    return jpushRegId
  } catch (e) {
    logger.warn('jpush.register.fail', { e: String(e) })
    return ''
  }
}

/** 注销当前设备（登出时调用） */
export async function unregisterJPush(): Promise<void> {
  try {
    const deviceId = getStorage<string>(STORAGE_KEYS.DEVICE_ID)
    if (!deviceId) return
    await post('/rider/device/unregister', { deviceId }, { silent: true, retry: 1 })
    removeStorage(STORAGE_KEYS.JPUSH_REG_ID)
    logger.info('jpush.unregister.ok')
  } catch (e) {
    logger.warn('jpush.unregister.fail', { e: String(e) })
  }
}

/**
 * 监听极光推送通知点击（APP 端）
 * 用途：用户点击通知栏 → 跳转对应订单详情 / 派单弹层
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

/**
 * 监听极光推送透传消息（APP 端，可在前后台收到）
 * 用途：派单 / 转单 / 紧急回执的兜底通道（与 WS 双发）
 */
export function onJPushTransparentMessage(
  onMessage: (payload: Record<string, unknown>) => void
): void {
  try {
    const p = getPlus()
    if (!p?.push?.addEventListener) return
    p.push.addEventListener('receive', (msg: unknown) => {
      const m = msg as { payload?: Record<string, unknown>; data?: Record<string, unknown> }
      onMessage(m.payload ?? m.data ?? {})
    })
  } catch (e) {
    logger.warn('jpush.transparent.fail', { e: String(e) })
  }
}
