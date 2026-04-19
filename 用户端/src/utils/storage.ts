/**
 * @file storage.ts
 * @stage P5/T5.3 (Sprint 1)
 * @desc 本地存储统一封装（基于 uni.setStorageSync），含序列化、过期、命名空间
 * @author 单 Agent V2.0
 */
import { logger } from './logger'

/** 存储键常量 */
export const STORAGE_KEYS = {
  TOKEN: 'o2o_token',
  REFRESH_TOKEN: 'o2o_refresh_token',
  USER_INFO: 'o2o_user_info',
  CITY: 'o2o_city',
  ADDRESS: 'o2o_address',
  SEARCH_HISTORY: 'o2o_search_history',
  GUIDE_FLAGS: 'o2o_guide_flags',
  CART: 'o2o_cart',
  THEME: 'o2o_theme',
  /** 埋点离线缓冲（P5-REVIEW-01 R1 / I-10） */
  TRACK_BUFFER: 'o2o_track_buffer'
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
