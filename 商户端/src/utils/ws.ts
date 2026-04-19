/**
 * @file ws.ts
 * @stage P6/T6.2 (Sprint 1)
 * @desc WebSocket 客户端封装：心跳 30s + 断线重连（指数退避，最多 5 次） + topic 订阅
 *
 * 商户端 topic（DESIGN 仅明确 MERCHANT_NEW_ORDER；其余按 P4 后端约定补全）：
 *   - merchant:order:new                  新订单（核心，触发 NewOrderModal）
 *   - merchant:order:status:changed       订单状态变更
 *   - merchant:order:abnormal             订单异常（用户上报）
 *   - merchant:order:refund:apply         退款申请
 *   - merchant:shop:status:changed        店铺营业状态变更（多端同步）
 *   - merchant:review:new                 新评价
 *   - merchant:withdraw:result            提现结果
 *   - merchant:message:new                站内信
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { logger } from './logger'
import { getStorage, STORAGE_KEYS } from './storage'

/** 商户端 WebSocket 事件主题 */
export type MerchantWsTopic =
  | 'merchant:order:new'
  | 'merchant:order:status:changed'
  | 'merchant:order:abnormal'
  | 'merchant:order:refund:apply'
  | 'merchant:shop:status:changed'
  | 'merchant:review:new'
  | 'merchant:withdraw:result'
  | 'merchant:message:new'

/** 单条事件 */
export interface WsEvent<T = unknown> {
  topic: MerchantWsTopic | string
  data: T
  ts: number
  traceId?: string
}

/** 订阅回调 */
export type WsHandler<T = unknown> = (event: WsEvent<T>) => void

/** WS 配置 */
export interface WsOptions {
  url: string
  heartbeatMs?: number
  maxReconnect?: number
  reconnectBaseMs?: number
  reconnectMaxMs?: number
}

/** 内部连接状态 */
type WsState = 'idle' | 'connecting' | 'open' | 'closing' | 'closed'

class WsClient {
  private socket: UniApp.SocketTask | null = null
  private state: WsState = 'idle'
  private url = ''
  private heartbeatMs = 30_000
  private maxReconnect = 5
  private reconnectBaseMs = 1000
  private reconnectMaxMs = 30_000
  private reconnectCount = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private handlers: Map<string, Set<WsHandler>> = new Map()
  private manuallyClosed = false

  /**
   * 连接 WebSocket
   * @param opt 配置（url 必填）
   */
  connect(opt: WsOptions): void {
    this.url = opt.url
    if (opt.heartbeatMs) this.heartbeatMs = opt.heartbeatMs
    if (opt.maxReconnect) this.maxReconnect = opt.maxReconnect
    if (opt.reconnectBaseMs) this.reconnectBaseMs = opt.reconnectBaseMs
    if (opt.reconnectMaxMs) this.reconnectMaxMs = opt.reconnectMaxMs
    this.manuallyClosed = false
    this.open()
  }

  /** 真正建链 */
  private open(): void {
    if (this.state === 'open' || this.state === 'connecting') return
    this.state = 'connecting'
    const token = getStorage<string>(STORAGE_KEYS.TOKEN)
    const finalUrl = token ? `${this.url}?token=${encodeURIComponent(token)}` : this.url
    try {
      this.socket = uni.connectSocket({
        url: finalUrl,
        complete: () => {
          /* noop */
        }
      }) as UniApp.SocketTask

      this.socket.onOpen(() => {
        this.state = 'open'
        this.reconnectCount = 0
        this.startHeartbeat()
        logger.info('ws.open', { url: this.url })
      })

      this.socket.onMessage((res) => {
        try {
          const raw = res.data
          if (typeof raw !== 'string') return
          if (raw === 'pong' || raw === '{"type":"pong"}') return
          const event = JSON.parse(raw) as WsEvent
          this.dispatch(event)
        } catch (e) {
          logger.warn('ws.parse.fail', { e: String(e) })
        }
      })

      this.socket.onError((err) => {
        logger.warn('ws.error', { err: String(err.errMsg ?? '') })
      })

      this.socket.onClose(() => {
        this.state = 'closed'
        this.stopHeartbeat()
        if (!this.manuallyClosed) this.scheduleReconnect()
      })
    } catch (e) {
      this.state = 'closed'
      logger.error('ws.connect.fail', { e: String(e) })
      this.scheduleReconnect()
    }
  }

  /** 启动心跳 */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== 'open' || !this.socket) return
      try {
        this.socket.send({ data: 'ping' })
      } catch (e) {
        logger.warn('ws.heartbeat.fail', { e: String(e) })
      }
    }, this.heartbeatMs)
  }

  /** 停止心跳 */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** 重连调度 */
  private scheduleReconnect(): void {
    if (this.reconnectCount >= this.maxReconnect) {
      logger.warn('ws.reconnect.exceeded', { count: this.reconnectCount })
      return
    }
    const delay = Math.min(this.reconnectBaseMs * 2 ** this.reconnectCount, this.reconnectMaxMs)
    this.reconnectCount += 1
    logger.info('ws.reconnect.schedule', { delayMs: delay, attempt: this.reconnectCount })
    setTimeout(() => {
      if (!this.manuallyClosed) this.open()
    }, delay)
  }

  /** 主动断开 */
  disconnect(): void {
    this.manuallyClosed = true
    this.stopHeartbeat()
    if (this.socket) {
      try {
        this.socket.close({})
      } catch (e) {
        logger.warn('ws.close.fail', { e: String(e) })
      }
      this.socket = null
    }
    this.state = 'closed'
  }

  /**
   * 订阅事件
   * @param topic 事件主题
   * @param handler 回调
   * @returns 取消订阅函数
   */
  subscribe<T = unknown>(topic: MerchantWsTopic | string, handler: WsHandler<T>): () => void {
    if (!this.handlers.has(topic)) this.handlers.set(topic, new Set())
    this.handlers.get(topic)?.add(handler as WsHandler)
    return () => this.unsubscribe(topic, handler)
  }

  /** 取消订阅 */
  unsubscribe<T = unknown>(topic: MerchantWsTopic | string, handler: WsHandler<T>): void {
    this.handlers.get(topic)?.delete(handler as WsHandler)
  }

  /** 派发事件到订阅者 */
  private dispatch(event: WsEvent): void {
    const set = this.handlers.get(event.topic)
    if (!set) return
    for (const fn of set) {
      try {
        fn(event)
      } catch (e) {
        logger.error('ws.handler.error', { topic: event.topic, e: String(e) })
      }
    }
  }

  /** 当前是否已连接 */
  isOpen(): boolean {
    return this.state === 'open'
  }
}

/** 全局单例 */
export const ws = new WsClient()

/** 读取 env 配置 */
function getWsBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.VITE_WS_BASE_URL ?? 'ws://localhost:3000/ws'
}

/**
 * 启动 WebSocket（按需调用，例如登录后或进入工作台前）
 * @param merchantId 当前商户 ID（拼接 path）
 * @param shopId 当前店铺 ID（订阅 shop 维度 topic）
 */
export function startWs(merchantId?: string | number, shopId?: string | number): void {
  if (ws.isOpen()) return
  const base = getWsBaseUrl()
  const path = merchantId ? `/merchant/${merchantId}` : '/merchant'
  const query = shopId ? `?shopId=${encodeURIComponent(String(shopId))}` : ''
  const url = `${base}${path}${query}`
  ws.connect({
    url,
    heartbeatMs: 30_000,
    maxReconnect: 5,
    reconnectBaseMs: 1000,
    reconnectMaxMs: 30_000
  })
}

/** 关闭 WebSocket（应用进入后台或登出） */
export function stopWs(): void {
  ws.disconnect()
}
