/**
 * @file push-register.ts
 * @stage P9/W5.E.4 (Sprint 5) — 用户端推送 token 注册
 * @desc 三端共用的简单注册器（mock 优先，本期不接极光 SDK）：
 *   - 检查环境（mp-weixin / app-plus）
 *   - 取 registrationId（极光 SDK 缺失时返回 mock 字符串，便于联调）
 *   - 调后端 /push/register / /push/unregister / /push/heartbeat
 *
 * 后续真实接入：
 *   - APP：plus.push.getClientInfo().clientid
 *   - 小程序：可走 wx.getUserInfo / openid 衍生 token（推送方式不同）
 *
 * @author Agent E (P9 Sprint 5)
 */
import { logger } from './logger'

/* ============================================================================
 * 类型
 * ============================================================================ */

/** 注册结果 */
export interface PushRegisterResult {
  ok: boolean
  registrationId?: string
  reason?: string
}

/** 当前端的 platform 字符串（与后端 push_token.platform 列对齐） */
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

/** 安全读取 plus.push */
function getPlusPush(): PlusPushCustom | null {
  try {
    const p = (globalThis as unknown as { plus?: PlusGlobal }).plus
    return p?.push ?? null
  } catch {
    return null
  }
}

/** 检测当前 platform */
function detectPlatform(): PushPlatform {
  /* APP-PLUS：plus 全局存在 */
  if (getPlusPush()) {
    try {
      const sys = uni.getSystemInfoSync()
      return sys.platform === 'ios' ? 'ios' : 'android'
    } catch {
      return 'android'
    }
  }
  /* 默认走小程序 */
  return 'mp'
}

/** 设备 ID（持久化在 storage，避免每次变） */
const DEVICE_ID_KEY = 'O2O_USER_PUSH_DEVICE_ID'

function getOrCreateDeviceId(): string {
  try {
    const cached = uni.getStorageSync(DEVICE_ID_KEY)
    if (typeof cached === 'string' && cached) return cached
  } catch {
    /* ignore */
  }
  const id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  try {
    uni.setStorageSync(DEVICE_ID_KEY, id)
  } catch {
    /* ignore */
  }
  return id
}

/**
 * 获取 registrationId
 * 真实接入时：从极光 SDK 取；当前降级为 mock string。
 */
function getRegistrationId(): string {
  const p = getPlusPush()
  if (p?.getClientInfo) {
    try {
      const info = p.getClientInfo()
      const rid = info.regId ?? info.clientid ?? ''
      if (rid) return rid
    } catch (e) {
      /* TODO 真实接入：plus.push 异常处理 */
      logger.warn('push.getClientInfo.fail', { e: String(e) })
    }
  }
  /* TODO P10：接入极光 / FCM / APNs 真实 SDK；当前 mock 用于联调 */
  return `mock-rid-user-${getOrCreateDeviceId().slice(0, 12)}`
}

/** 应用版本号（构建时注入） */
function getAppVersion(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.VITE_APP_VERSION ?? '0.1.0'
}

/* ============================================================================
 * 后端调用：使用最简 uni.request（避免引 request.ts 的 token 副作用）
 *           真实集成时 A 可改为统一 request 实例
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
 * 返回值：{ ok, registrationId? }
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
