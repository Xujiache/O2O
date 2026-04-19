/**
 * Admin WebSocket 客户端
 *
 * 用途：管理后台实时推送（数据大盘 / 待办 / 风险告警 / 仲裁）
 *
 * 设计要点：
 * - 单例模式，整个 admin 共享一个 WS 连接
 * - 基于 mitt 的 topic 订阅机制（业务模块按 topic 订阅）
 * - 5s 内多次推送节流为 1 次（合并 dashboard tick）
 * - Page Visibility 检测（页面不可见时暂停心跳）
 * - 指数退避重连
 *
 * 后端 P3 admin namespace topic 列表：
 * - admin:dashboard:tick           大盘 5s 推送
 * - admin:order:new                新订单
 * - admin:order:status:changed     订单状态变更
 * - admin:complaint:new            新投诉
 * - admin:arbitration:pending      新仲裁
 * - admin:withdraw:apply           新提现申请
 * - admin:invoice:apply            新发票申请
 * - admin:risk:hit                 风控命中
 * - admin:cheat:detected           刷单识别
 *
 * @module utils/business/ws-admin
 */
import mitt, { type Emitter } from 'mitt'
import { STORAGE_KEYS, bizSet } from './storage-keys'

/** 服务端推送 topic */
export type WsTopic =
  | 'admin:dashboard:tick'
  | 'admin:order:new'
  | 'admin:order:status:changed'
  | 'admin:complaint:new'
  | 'admin:arbitration:pending'
  | 'admin:withdraw:apply'
  | 'admin:invoice:apply'
  | 'admin:risk:hit'
  | 'admin:cheat:detected'
  | 'admin:system:notice'

/** WS 消息载荷 */
export interface WsPayload<T = unknown> {
  topic: WsTopic
  data: T
  ts: number
}

/** WS 连接事件类型映射 */
type WsEvents = {
  open: void
  close: { code: number; reason?: string }
  error: Event
  message: WsPayload
} & {
  [K in WsTopic]: WsPayload
}

class AdminWsClient {
  private ws: WebSocket | null = null
  private emitter: Emitter<WsEvents> = mitt<WsEvents>()
  private url = ''
  private token = ''
  private reconnectAttempts = 0
  private readonly maxReconnect = 10
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private stopFlag = false
  private visibilityHandler: (() => void) | null = null
  private throttleBuckets = new Map<WsTopic, number>()
  private readonly throttleMs = 5000

  /**
   * 连接 WS（幂等：已连接时直接返回）
   * @param baseUrl ws/wss 基础 url
   * @param token Bearer token，自动拼到 query
   */
  connect(baseUrl: string, token: string): void {
    if (!baseUrl) {
      console.warn('[WS-Admin] baseUrl 为空，跳过连接')
      return
    }
    this.url = baseUrl
    this.token = token
    this.stopFlag = false
    this.openSocket()
    this.bindVisibility()
  }

  private openSocket(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    try {
      const url = `${this.url}${this.url.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.token)}`
      this.ws = new WebSocket(url)
      this.ws.onopen = this.onOpen
      this.ws.onmessage = this.onMessage
      this.ws.onerror = this.onError
      this.ws.onclose = this.onClose
    } catch (e) {
      console.warn('[WS-Admin] 创建 WebSocket 失败', e)
      this.scheduleReconnect()
    }
  }

  private onOpen = (): void => {
    this.reconnectAttempts = 0
    this.startHeartbeat()
    this.emitter.emit('open')
  }

  private onMessage = (ev: MessageEvent): void => {
    const raw = typeof ev.data === 'string' ? ev.data : ''
    if (raw === 'pong' || raw === 'ping') return
    try {
      const payload = JSON.parse(raw) as WsPayload
      bizSet(STORAGE_KEYS.WS_LAST_TS, Date.now())
      this.emitter.emit('message', payload)
      const last = this.throttleBuckets.get(payload.topic) || 0
      const now = Date.now()
      if (now - last < this.throttleMs && payload.topic === 'admin:dashboard:tick') {
        return
      }
      this.throttleBuckets.set(payload.topic, now)
      this.emitter.emit(payload.topic, payload)
    } catch {
      // 非 JSON 消息忽略
    }
  }

  private onError = (e: Event): void => {
    this.emitter.emit('error', e)
  }

  private onClose = (e: CloseEvent): void => {
    this.stopHeartbeat()
    this.emitter.emit('close', { code: e.code, reason: e.reason })
    if (!this.stopFlag) this.scheduleReconnect()
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping')
    }, 20_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.stopFlag) return
    if (this.reconnectAttempts >= this.maxReconnect) return
    if (this.reconnectTimer) return
    const delay =
      Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30_000) + Math.random() * 1000
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
  }

  private bindVisibility(): void {
    if (this.visibilityHandler) return
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.startHeartbeat()
      } else {
        this.stopHeartbeat()
      }
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  /** 断开连接（不再自动重连） */
  disconnect(): void {
    this.stopFlag = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
    if (this.ws) {
      try {
        this.ws.close(1000, 'admin disconnect')
      } catch {
        /* ignore */
      }
      this.ws = null
    }
    this.emitter.all.clear()
  }

  /** 订阅事件 */
  on<E extends keyof WsEvents>(event: E, handler: (data: WsEvents[E]) => void): void {
    this.emitter.on(event, handler as (data: WsEvents[E]) => void)
  }

  /** 取消订阅 */
  off<E extends keyof WsEvents>(event: E, handler: (data: WsEvents[E]) => void): void {
    this.emitter.off(event, handler as (data: WsEvents[E]) => void)
  }

  /** 主动发送 */
  send(data: string | object): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    const raw = typeof data === 'string' ? data : JSON.stringify(data)
    try {
      this.ws.send(raw)
    } catch (e) {
      console.warn('[WS-Admin] send 失败', e)
    }
  }

  /** 当前连接状态 */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  /** 是否已连接 */
  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

/** 全局单例 */
export const wsAdmin = new AdminWsClient()
