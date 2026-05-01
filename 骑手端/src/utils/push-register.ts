/**
 * @file push-register.ts
 * @stage P9/W5.E.4 (Sprint 5) — 骑手端推送 token 注册
 * @desc 骑手端简单注册器（mock 优先，本期不接极光 SDK）：
 *   - 检查环境（mp-weixin / app-plus）
 *   - 取 registrationId（plus.push.getClientInfo 优先；缺失走 mock）
 *   - 调后端 /push/register / /push/unregister / /push/heartbeat
 *
 * @author Agent E (P9 Sprint 5)
 */
import { logger } from './logger'

/* ============================================================================
 * 类型
 * ============================================================================ */

export interface PushRegisterResult {
  ok: boolean
  registrationId?: string
  reason?: string
}

type PushPlatform = 'ios' | 'android' | 'mp'

/* ============================================================================
 * 内部工具
 * ============================================================================ */

interface PlusPushCustom {
  getClientInfo?: () => { clientid?: string; regId?: string }
}

interface PlusGlobal {
  push?: PlusPushCustom
}

function getPlusPush(): PlusPushCustom | null {
  try {
    const p = (globalThis as unknown as { plus?: PlusGlobal }).plus
    return p?.push ?? null
  } catch {
    return null
  }
}

function detectPlatform(): PushPlatform {
  if (getPlusPush()) {
    try {
      const sys = uni.getSystemInfoSync()
      return sys.platform === 'ios' ? 'ios' : 'android'
    } catch {
      return 'android'
    }
  }
  return 'mp'
}

const DEVICE_ID_KEY = 'O2O_RIDER_PUSH_DEVICE_ID'

function getOrCreateDeviceId(): string {
  try {
    const cached = uni.getStorageSync(DEVICE_ID_KEY)
    if (typeof cached === 'string' && cached) return cached
  } catch {
    /* ignore */
  }
  const id = `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  try {
    uni.setStorageSync(DEVICE_ID_KEY, id)
  } catch {
    /* ignore */
  }
  return id
}

function getRegistrationId(): string {
  const p = getPlusPush()
  if (p?.getClientInfo) {
    try {
      const info = p.getClientInfo()
      const rid = info.regId ?? info.clientid ?? ''
      if (rid) return rid
    } catch (e) {
      logger.warn('push.getClientInfo.fail', { e: String(e) })
    }
  }
  /* TODO P10：接入极光 SDK；当前 mock 用于联调 */
  return `mock-rid-rider-${getOrCreateDeviceId().slice(0, 12)}`
}

function getAppVersion(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.VITE_APP_VERSION ?? '0.1.0'
}

/* ============================================================================
 * 后端调用
 * ============================================================================ */

interface BackendBaseUrl {
  base: string
}

function getBaseUrl(): BackendBaseUrl {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return {
    base: env?.VITE_API_BASE ?? '/api/v1'
  }
}

function getToken(): string {
  try {
    const t = uni.getStorageSync('access_token')
    return typeof t === 'string' ? t : ''
  } catch {
    return ''
  }
}

function postJson(path: string, data: Record<string, unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const { base } = getBaseUrl()
      uni.request({
        url: `${base}${path}`,
        method: 'POST',
        data,
        header: {
          'Content-Type': 'application/json',
          Authorization: getToken() ? `Bearer ${getToken()}` : ''
        },
        success: () => resolve(true),
        fail: (err) => {
          logger.warn('push.req.fail', { path, err: String(err.errMsg ?? '') })
          resolve(false)
        }
      })
    } catch (e) {
      logger.warn('push.req.error', { path, e: String(e) })
      resolve(false)
    }
  })
}

function deleteJson(path: string, query: Record<string, string>): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const { base } = getBaseUrl()
      const qs = Object.entries(query)
        .filter(([, v]) => v)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
      uni.request({
        url: `${base}${path}${qs ? '?' + qs : ''}`,
        method: 'DELETE',
        header: {
          Authorization: getToken() ? `Bearer ${getToken()}` : ''
        },
        success: () => resolve(true),
        fail: (err) => {
          logger.warn('push.req.fail', { path, err: String(err.errMsg ?? '') })
          resolve(false)
        }
      })
    } catch (e) {
      logger.warn('push.req.error', { path, e: String(e) })
      resolve(false)
    }
  })
}

/* ============================================================================
 * 公开 API
 * ============================================================================ */

/**
 * 注册推送 token（登录后调用）
 */
export async function registerPush(): Promise<PushRegisterResult> {
  try {
    const platform = detectPlatform()
    const registrationId = getRegistrationId()
    const deviceId = getOrCreateDeviceId()
    const appVersion = getAppVersion()
    const ok = await postJson('/push/register', {
      platform,
      registrationId,
      deviceId,
      appVersion
    })
    if (!ok) return { ok: false, reason: 'request_failed' }
    logger.info('push.register.ok', { platform, deviceId })
    return { ok: true, registrationId }
  } catch (e) {
    logger.warn('push.register.error', { e: String(e) })
    return { ok: false, reason: 'exception' }
  }
}

/**
 * 注销推送 token（退出登录调用）
 */
export async function unregisterPush(): Promise<{ ok: boolean }> {
  try {
    const deviceId = getOrCreateDeviceId()
    const ok = await deleteJson('/push/unregister', { deviceId })
    return { ok }
  } catch (e) {
    logger.warn('push.unregister.error', { e: String(e) })
    return { ok: false }
  }
}

/**
 * 心跳：刷新后端的 last_active_at
 */
export async function heartbeatPush(): Promise<{ ok: boolean }> {
  try {
    const deviceId = getOrCreateDeviceId()
    const ok = await postJson('/push/heartbeat', { deviceId })
    return { ok }
  } catch (e) {
    logger.warn('push.heartbeat.error', { e: String(e) })
    return { ok: false }
  }
}
