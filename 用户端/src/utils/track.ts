/**
 * @file track.ts
 * @stage P5/T5.51 (Sprint 8) + P5-REVIEW-01 R1 (I-10)
 * @desc 埋点上报：批量缓冲 + 定时 flush + 离线持久化（kill 后再启动不丢事件）
 *
 * I-10 修复要点：
 * - BUFFER 启动时从 STORAGE_KEYS.TRACK_BUFFER 恢复（避免小程序冷启动丢数据）
 * - 入队 / 出队 / flush 失败回滚后均同步持久化
 * - 持久化上限 200 条（避免存储无限膨胀）
 *
 * @author 单 Agent V2.0
 */
import { logger } from './logger'
import { useUserStore } from '@/store/user'
import { post } from './request'
import { getStorage, setStorage, STORAGE_KEYS } from './storage'

/** 埋点事件 */
export interface TrackEvent {
  /** 事件 ID（如 view_home / click_order_pay） */
  eventId: string
  /** 业务参数 */
  params?: Record<string, unknown>
  /** 来源页 */
  from?: string
  /** 目标页 */
  to?: string
  /** 触发时间戳（毫秒） */
  ts?: number
}

/** 单批最大条数；超过即触发 flush */
const MAX_BATCH = 20
/** 定时 flush 间隔（毫秒） */
const FLUSH_INTERVAL_MS = 10_000
/** 持久化上限（防止存储爆掉；保留最近 N 条） */
const PERSIST_MAX = 200

/**
 * 内存缓冲（启动时从 storage 恢复）
 * 注：getStorage 返回 null 时退回空数组
 */
const BUFFER: TrackEvent[] = (() => {
  const restored = getStorage<TrackEvent[]>(STORAGE_KEYS.TRACK_BUFFER)
  return Array.isArray(restored) ? restored : []
})()

let flushTimer: ReturnType<typeof setInterval> | null = null

/** 启动定时 flush */
function ensureTimer() {
  if (flushTimer) return
  flushTimer = setInterval(() => {
    void flush()
  }, FLUSH_INTERVAL_MS)
}

/**
 * 持久化当前 BUFFER（仅保留最近 PERSIST_MAX 条）
 * 同步写入 uni.setStorageSync；失败时静默 warn
 */
function persistBuffer() {
  try {
    const slice = BUFFER.length > PERSIST_MAX ? BUFFER.slice(-PERSIST_MAX) : BUFFER
    setStorage(STORAGE_KEYS.TRACK_BUFFER, slice)
  } catch (e) {
    logger.warn('track.persist.fail', { e: String(e) })
  }
}

/** 上报一个事件（不会立即发送，先入缓冲） */
export function track(
  eventId: string,
  params?: Record<string, unknown>,
  opt?: { from?: string; to?: string }
) {
  ensureTimer()
  BUFFER.push({
    eventId,
    params,
    from: opt?.from,
    to: opt?.to,
    ts: Date.now()
  })
  persistBuffer()
  if (BUFFER.length >= MAX_BATCH) {
    void flush()
  }
}

/** 真正发送 */
export async function flush(): Promise<void> {
  if (BUFFER.length === 0) return
  const batch = BUFFER.splice(0, BUFFER.length)
  /* 立即持久化（防止 flush 失败后 BUFFER 被清空但磁盘上还残留旧数据） */
  persistBuffer()
  const user = useUserStore()
  try {
    await post(
      '/track/events',
      {
        uid: user.profile?.id,
        events: batch
      },
      { silent: true, retry: 1 }
    )
  } catch (e) {
    /* 失败回滚到队首；保留最近 PERSIST_MAX 条避免无限堆积 */
    logger.warn('track.flush.fail', { e: String(e) })
    BUFFER.unshift(...batch.slice(0, PERSIST_MAX))
    persistBuffer()
  }
}

/** 应用退出前强制 flush */
export function flushNow(): Promise<void> {
  return flush()
}

/** 标准事件常量（详见 ACCEPTANCE V5.x） */
export const TRACK = {
  VIEW_HOME: 'view_home',
  VIEW_TAKEOUT: 'view_takeout',
  VIEW_ERRAND: 'view_errand',
  VIEW_SHOP: 'view_shop',
  VIEW_PRODUCT: 'view_product',
  VIEW_ORDER_LIST: 'view_order_list',
  VIEW_ORDER_DETAIL: 'view_order_detail',
  VIEW_USER_HOME: 'view_user_home',
  VIEW_LOGIN: 'view_login',
  CLICK_LOGIN: 'click_login',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAIL: 'login_fail',
  CLICK_ADD_CART: 'click_add_cart',
  CLICK_REMOVE_CART: 'click_remove_cart',
  CLICK_CHECKOUT: 'click_checkout',
  CLICK_PLACE_ORDER: 'click_place_order',
  PLACE_ORDER_SUCCESS: 'place_order_success',
  PLACE_ORDER_FAIL: 'place_order_fail',
  CLICK_PAY: 'click_pay',
  PAY_SUCCESS: 'pay_success',
  PAY_FAIL: 'pay_fail',
  CLICK_TRACK_MAP: 'click_track_map',
  CLICK_CONTACT_RIDER: 'click_contact_rider',
  CLICK_REVIEW: 'click_review',
  SUBMIT_REVIEW: 'submit_review',
  CLICK_AFTER_SALE: 'click_after_sale',
  SUBMIT_AFTER_SALE: 'submit_after_sale',
  CLICK_COMPLAINT: 'click_complaint',
  REQUEST_SUBSCRIBE: 'request_subscribe',
  SUBSCRIBE_ACCEPT: 'subscribe_accept',
  SUBSCRIBE_REJECT: 'subscribe_reject',
  CLICK_INVITE: 'click_invite',
  CLICK_COUPON: 'click_coupon',
  RECEIVE_COUPON: 'receive_coupon',
  CLICK_FAVORITE: 'click_favorite',
  CLICK_SEARCH: 'click_search',
  SEARCH_SUBMIT: 'search_submit',
  CLICK_BANNER: 'click_banner',
  WS_RECONNECT: 'ws_reconnect',
  ERROR_CAUGHT: 'error_caught'
} as const
