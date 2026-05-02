/**
 * @file storage.ts
 * @stage P7/T7.1 (Sprint 1)
 * @desc 本地存储统一封装（基于 uni.setStorageSync），含序列化、过期、命名空间
 *   骑手端命名空间：o2o_rider_*（与商户端 o2o_mchnt_* / 用户端 o2o_user_* 隔离）
 *
 * P6 经验教训：所有 getStorage/setStorage 的 key 必须从 STORAGE_KEYS 取，
 *              禁止硬编码字符串（P6-R1 / I-05 jpush 同款坑）
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { logger } from './logger'

/** 存储键常量（骑手端命名空间 o2o_rider_*） */
export const STORAGE_KEYS = {
  TOKEN: 'o2o_rider_token',
  REFRESH_TOKEN: 'o2o_rider_refresh_token',
  USER_INFO: 'o2o_rider_user_info',
  PERMISSIONS: 'o2o_rider_permissions',
  /** 当前上下班状态（true=已上班/在线接单） */
  WORK_STATUS: 'o2o_rider_work_status',
  /** 接单偏好：mode / types / radius */
  ACCEPT_PREFERENCE: 'o2o_rider_accept_preference',
  /** 通知/铃声/语音/振动设置 */
  NOTIFY_SETTINGS: 'o2o_rider_notify_settings',
  /** 主题（暂未启用） */
  THEME: 'o2o_rider_theme',
  /** 引导页是否已读 */
  GUIDE_FLAGS: 'o2o_rider_guide_flags',
  /** 极光推送 RegistrationId */
  JPUSH_REG_ID: 'o2o_rider_jpush_reg_id',
  /** 设备 ID（与 jpush.ts 共用） */
  DEVICE_ID: 'o2o_rider_device_id',
  /** 埋点离线缓冲（与 track.ts 共用） */
  TRACK_BUFFER: 'o2o_rider_track_buffer',
  /** 定位上报离线队列（断网时入队，恢复后补传，最大 1000 点） */
  LOCATION_OFFLINE_QUEUE: 'o2o_rider_location_offline_queue',
  /** 上次刷新时间戳（onShow 节流，参见 P6-R1 / I-07） */
  LAST_REFRESH_TS: 'o2o_rider_last_refresh_ts',
  /** 默认导航 vendor: amap / baidu */
  NAV_VENDOR: 'o2o_rider_nav_vendor',
  /** 默认电话脱敏中转配置 */
  CALL_RELAY: 'o2o_rider_call_relay',
  /** 取件码错误次数（防爆破） */
  PICKUP_ERROR_COUNT: 'o2o_rider_pickup_error_count',
  /** 骑手登录后辅助状态：保证金已交标记 + 健康证有效期 */
  AUTH_EXTRA: 'o2o_rider_auth_extra',
  /**
   * pinia-plugin-persistedstate 的 auth store 持久化 key
   * P9 Sprint 7 W7.C.3：统一抽常量，原硬编码字符串收敛至此
   * 值保持不变以兼容已安装用户 localStorage 中的既有数据
   */
  AUTH_PERSIST: 'o2o_rider_auth'
} as const

interface StorageEntry<T> {
  v: T
  expireAt?: number
}

/**
 * 写入本地存储（带过期时间）
 * @param key 键名
 * @param value 值
 * @param ttlMs 过期毫秒数（可选）
 */
export function setStorage<T>(key: string, value: T, ttlMs?: number): void {
  try {
    const entry: StorageEntry<T> = {
      v: value,
      expireAt: ttlMs ? Date.now() + ttlMs : undefined
    }
    uni.setStorageSync(key, JSON.stringify(entry))
  } catch (e) {
    logger.warn('storage.set.fail', { key, e: String(e) })
  }
}

/**
 * 读取本地存储；过期则返回 null（并自动清理）
 */
export function getStorage<T>(key: string): T | null {
  try {
    const raw = uni.getStorageSync(key)
    if (!raw) return null
    const entry: StorageEntry<T> = JSON.parse(raw as string)
    if (entry.expireAt && entry.expireAt < Date.now()) {
      uni.removeStorageSync(key)
      return null
    }
    return entry.v
  } catch (e) {
    logger.warn('storage.get.fail', { key, e: String(e) })
    return null
  }
}

/** 删除一个键 */
export function removeStorage(key: string): void {
  try {
    uni.removeStorageSync(key)
  } catch (e) {
    logger.warn('storage.remove.fail', { key, e: String(e) })
  }
}

/** 清空所有存储（仅清自管命名空间，不影响第三方 SDK 的 storage） */
export function clearOurStorage(): void {
  for (const k of Object.values(STORAGE_KEYS)) {
    removeStorage(k)
  }
}
