/**
 * @file track.ts
 * @stage P6/T6.2 (Sprint 1)
 * @desc 埋点上报：批量缓冲 + 定时 flush + 离线持久化
 *
 * P5-REVIEW-01 R1 / I-10 经验沉淀：
 *   - BUFFER 启动时从 STORAGE_KEYS.TRACK_BUFFER 恢复（避免冷启动丢数据）
 *   - 入队 / 出队 / flush 失败回滚后均同步持久化
 *   - 持久化上限 200 条（避免存储无限膨胀）
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from './logger'
import { post } from './request'
import { getStorage, setStorage, STORAGE_KEYS } from './storage'

/** 埋点事件 */
export interface TrackEvent {
  /** 事件 ID（如 view_workbench / click_accept_order） */
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

/**
 * 上报一个事件（不会立即发送，先入缓冲）
 * @param eventId 事件 ID
 * @param params 业务参数
 * @param opt from/to 路由信息
 */
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
  try {
    await post(
      '/merchant/track/events',
      {
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

/** 商户端标准事件常量 */
export const TRACK = {
  /* 页面浏览 */
  VIEW_LOGIN: 'view_login',
  VIEW_WORKBENCH: 'view_workbench',
  VIEW_ORDER_LIST: 'view_order_list',
  VIEW_ORDER_DETAIL: 'view_order_detail',
  VIEW_PRODUCT_LIST: 'view_product_list',
  VIEW_PRODUCT_EDIT: 'view_product_edit',
  VIEW_FINANCE: 'view_finance',
  VIEW_STAT: 'view_stat',
  VIEW_SHOP_EDIT: 'view_shop_edit',
  VIEW_DELIVERY_AREA: 'view_delivery_area',
  /* 登录与认证 */
  CLICK_LOGIN: 'click_login',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAIL: 'login_fail',
  SUBMIT_APPLY: 'submit_apply',
  APPLY_APPROVED: 'apply_approved',
  APPLY_REJECTED: 'apply_rejected',
  /* 订单操作 */
  RECEIVE_NEW_ORDER: 'receive_new_order',
  CLICK_ACCEPT_ORDER: 'click_accept_order',
  CLICK_REJECT_ORDER: 'click_reject_order',
  CLICK_COOK_ORDER: 'click_cook_order',
  CLICK_REPRINT: 'click_reprint',
  CLICK_AUTO_ACCEPT_ON: 'click_auto_accept_on',
  CLICK_AUTO_ACCEPT_OFF: 'click_auto_accept_off',
  REFUND_APPROVE: 'refund_approve',
  REFUND_REJECT: 'refund_reject',
  REPORT_ABNORMAL: 'report_abnormal',
  /* 商品 */
  CREATE_PRODUCT: 'create_product',
  UPDATE_PRODUCT: 'update_product',
  TOGGLE_PRODUCT_ONLINE: 'toggle_product_online',
  /* 店铺 */
  TOGGLE_SHOP_OPEN: 'toggle_shop_open',
  EDIT_DELIVERY_AREA: 'edit_delivery_area',
  REPLY_REVIEW: 'reply_review',
  APPEAL_REVIEW: 'appeal_review',
  /* 财务 */
  WITHDRAW_APPLY: 'withdraw_apply',
  EXPORT_BILL: 'export_bill',
  APPLY_INVOICE: 'apply_invoice',
  /* 营销 */
  CREATE_COUPON: 'create_coupon',
  CREATE_PROMOTION: 'create_promotion',
  /* 子账号 */
  CREATE_STAFF: 'create_staff',
  /* 蓝牙打印 */
  PRINTER_CONNECT: 'printer_connect',
  PRINTER_DISCONNECT: 'printer_disconnect',
  PRINTER_PRINT_SUCCESS: 'printer_print_success',
  PRINTER_PRINT_FAIL: 'printer_print_fail',
  /* WS / 通用 */
  WS_RECONNECT: 'ws_reconnect',
  ERROR_CAUGHT: 'error_caught'
} as const
