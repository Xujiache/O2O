/**
 * @file track.ts
 * @stage P7/T7.1 (Sprint 1)
 * @desc 埋点上报：批量缓冲 + 定时 flush + 离线持久化
 *
 * P5-REVIEW-01 R1 / I-10 经验沉淀（P6 已验证 PASS）：
 *   - BUFFER 启动时从 STORAGE_KEYS.TRACK_BUFFER 恢复（避免冷启动丢数据）
 *   - 入队 / 出队 / flush 失败回滚后均同步持久化
 *   - 持久化上限 200 条（避免存储无限膨胀）
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { logger } from './logger'
import { post } from './request'
import { getStorage, setStorage, STORAGE_KEYS } from './storage'

/** 埋点事件 */
export interface TrackEvent {
  /** 事件 ID（如 view_workbench / click_accept_dispatch） */
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

/** 内存缓冲（启动时从 storage 恢复） */
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

/** 持久化当前 BUFFER（仅保留最近 PERSIST_MAX 条） */
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
  persistBuffer()
  try {
    await post(
      '/rider/track/events',
      {
        events: batch
      },
      { silent: true, retry: 1 }
    )
  } catch (e) {
    logger.warn('track.flush.fail', { e: String(e) })
    BUFFER.unshift(...batch.slice(0, PERSIST_MAX))
    persistBuffer()
  }
}

/** 应用退出前强制 flush */
export function flushNow(): Promise<void> {
  return flush()
}

/** 骑手端标准事件常量 */
export const TRACK = {
  /* 页面浏览 */
  VIEW_LOGIN: 'view_login',
  VIEW_WORKBENCH: 'view_workbench',
  VIEW_HALL: 'view_hall',
  VIEW_ORDER_LIST: 'view_order_list',
  VIEW_ORDER_DETAIL: 'view_order_detail',
  VIEW_WALLET: 'view_wallet',
  VIEW_ATTENDANCE: 'view_attendance',
  VIEW_STAT: 'view_stat',
  VIEW_LEVEL: 'view_level',
  VIEW_MSG: 'view_msg',
  VIEW_PROFILE: 'view_profile',
  /* 登录与认证 */
  CLICK_LOGIN: 'click_login',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAIL: 'login_fail',
  SUBMIT_QUALIFICATION: 'submit_qualification',
  PAY_DEPOSIT: 'pay_deposit',
  AUDIT_APPROVED: 'audit_approved',
  AUDIT_REJECTED: 'audit_rejected',
  /* 上下班 */
  CLICK_GO_ON_DUTY: 'click_go_on_duty',
  CLICK_GO_OFF_DUTY: 'click_go_off_duty',
  /* 派单交互 */
  RECEIVE_DISPATCH: 'receive_dispatch',
  CLICK_ACCEPT_DISPATCH: 'click_accept_dispatch',
  CLICK_REJECT_DISPATCH: 'click_reject_dispatch',
  DISPATCH_TIMEOUT: 'dispatch_timeout',
  CLICK_GRAB_ORDER: 'click_grab_order',
  GRAB_SUCCESS: 'grab_success',
  GRAB_FAIL: 'grab_fail',
  /* 配送流程 */
  CLICK_NAV_PICKUP: 'click_nav_pickup',
  CLICK_NAV_DELIVER: 'click_nav_deliver',
  PICKUP_SCAN_SUCCESS: 'pickup_scan_success',
  PICKUP_INPUT_SUCCESS: 'pickup_input_success',
  PICKUP_FAIL: 'pickup_fail',
  PROOF_UPLOAD_SUCCESS: 'proof_upload_success',
  PROOF_UPLOAD_FAIL: 'proof_upload_fail',
  CLICK_DELIVER_DONE: 'click_deliver_done',
  CLICK_REPORT_ABNORMAL: 'click_report_abnormal',
  CLICK_TRANSFER_ORDER: 'click_transfer_order',
  CALL_RELAY: 'call_relay',
  /* 钱包 */
  WITHDRAW_APPLY: 'withdraw_apply',
  EXPORT_SALARY: 'export_salary',
  /* 考勤 */
  CHECKIN_SUCCESS: 'checkin_success',
  CHECKOUT_SUCCESS: 'checkout_success',
  APPLY_LEAVE: 'apply_leave',
  /* 等级 / 奖惩 */
  LEVEL_UP: 'level_up',
  LEVEL_DOWN: 'level_down',
  REWARD_RECEIVED: 'reward_received',
  PUNISHMENT_RECEIVED: 'punishment_received',
  APPEAL_SUBMIT: 'appeal_submit',
  /* 紧急 */
  EMERGENCY_TRIGGER: 'emergency_trigger',
  /* 定位 */
  LOCATION_REPORT: 'location_report',
  LOCATION_OFFLINE: 'location_offline',
  LOCATION_RESUME: 'location_resume',
  LOCATION_DOWNGRADE: 'location_downgrade',
  /* WS / 通用 */
  WS_RECONNECT: 'ws_reconnect',
  ERROR_CAUGHT: 'error_caught'
} as const
