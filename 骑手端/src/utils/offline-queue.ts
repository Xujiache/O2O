/**
 * @file offline-queue.ts
 * @stage P7/T7.29 (Sprint 4)
 * @desc 定位上报离线队列：网络异常入队 + 恢复后批量补传
 *
 * 设计：
 *   - 内存队列 + 持久化（uni.setStorageSync STORAGE_KEYS.LOCATION_OFFLINE_QUEUE）
 *   - 上限 1000 点（满后丢弃最旧）
 *   - flush 失败回滚队首
 *
 * V7.20 验收：断网 10min 恢复后全部补传
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type { LocationPoint } from '@/types/biz'
import { getStorage, setStorage, STORAGE_KEYS } from './storage'
import { logger } from './logger'

const MAX_QUEUE_LEN = 1000

/** 加载持久化队列 */
function loadQueue(): LocationPoint[] {
  const arr = getStorage<LocationPoint[]>(STORAGE_KEYS.LOCATION_OFFLINE_QUEUE)
  return Array.isArray(arr) ? arr : []
}

/** 持久化队列（保留最近 N 条） */
function saveQueue(queue: LocationPoint[]): void {
  try {
    const slice = queue.length > MAX_QUEUE_LEN ? queue.slice(-MAX_QUEUE_LEN) : queue
    setStorage(STORAGE_KEYS.LOCATION_OFFLINE_QUEUE, slice)
  } catch (e) {
    logger.warn('offline-queue.persist.fail', { e: String(e) })
  }
}

/** 离线队列（单例） */
export class OfflineQueue {
  private queue: LocationPoint[]

  constructor() {
    this.queue = loadQueue()
  }

  /** 入队（满则丢弃最旧） */
  enqueue(point: LocationPoint): void {
    this.queue.push(point)
    if (this.queue.length > MAX_QUEUE_LEN) {
      this.queue = this.queue.slice(-MAX_QUEUE_LEN)
    }
    saveQueue(this.queue)
  }

  /** 批量入队 */
  enqueueBatch(points: LocationPoint[]): void {
    if (!points || points.length === 0) return
    this.queue.push(...points)
    if (this.queue.length > MAX_QUEUE_LEN) {
      this.queue = this.queue.slice(-MAX_QUEUE_LEN)
    }
    saveQueue(this.queue)
  }

  /** 取出全部并清空（flush 用） */
  drain(): LocationPoint[] {
    const arr = this.queue
    this.queue = []
    saveQueue(this.queue)
    return arr
  }

  /** 当前队列长度 */
  get size(): number {
    return this.queue.length
  }

  /** flush 失败时回滚 */
  rollback(points: LocationPoint[]): void {
    if (!points || points.length === 0) return
    /* 回滚到队首；保留最近 MAX_QUEUE_LEN 条 */
    const merged = [...points, ...this.queue]
    this.queue = merged.length > MAX_QUEUE_LEN ? merged.slice(-MAX_QUEUE_LEN) : merged
    saveQueue(this.queue)
  }

  /** 完整清空（异常恢复 / 登出时） */
  clear(): void {
    this.queue = []
    saveQueue(this.queue)
  }
}

/** 全局单例 */
export const offlineQueue = new OfflineQueue()
