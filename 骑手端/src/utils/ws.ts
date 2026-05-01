/**
 * @file ws.ts
 * @stage P7/T7.2 → P9/Sprint 6 W6.B.2（接通后端 RealtimeGateway 真实地址）
 * @desc WebSocket 客户端封装：心跳 30s + 断线重连（指数退避 2/5/10/30s 上限） + topic 订阅
 *
 * 骑手端 topic（DESIGN_P7 §3.3 派单交互 + 提示词 §4.4 约定）：
 *   - rider:dispatch:new                  系统派单（核心，触发 DispatchModal 弹层）
 *   - rider:order:status:changed          订单状态变更（局部刷新列表/详情）
 *   - rider:order:abnormal:reply          异常处理结果
 *   - rider:transfer:result               转单审核结果
 *   - rider:emergency:ack                 紧急求助受理回执
 *   - rider:wallet:balance:changed        钱包余额变动（提现/分账）
 *   - rider:level:changed                 等级/积分变动
 *   - rider:message:new                   新消息（站内信）
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { logger } from './logger'
import { getStorage, STORAGE_KEYS } from './storage'

/** 骑手端 WebSocket 事件主题 */
export type RiderWsTopic =
  | 'rider:dispatch:new'
  | 'rider:order:status:changed'
  | 'rider:order:abnormal:reply'
  | 'rider:transfer:result'
  | 'rider:emergency:ack'
  | 'rider:wallet:balance:changed'
  | 'rider:level:changed'
  | 'rider:message:new'

/** 单条事件 */
export interface WsEvent<T = unknown> {
  topic: RiderWsTopic | string
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
  /** 重连无上限次数；延迟阶梯 2s/5s/10s/30s（30s 上限） */
  private reconnectDelays = [2_000, 5_000, 10_000, 30_000]
  private reconnectMaxMs = 30_000
  private reconnectCount = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private handlers: Map<string, Set<WsHandler>> = new Map()
  private manuallyClosed = false
  private enabled = true

  /**
   * 连接 WebSocket
   * @param opt 配置（url 必填，为空则禁用）
   */
  connect(opt: WsOptions): void {
    if (!opt.url) {
      this.enabled = false
      console.warn('[ws.init.skip] empty VITE_WS_URL')
      return
    }
    this.enabled = true
    this.url = opt.url
    if (opt.heartbeatMs) this.heartbeatMs = opt.heartbeatMs
    if (opt.reconnectMaxMs) this.reconnectMaxMs = opt.reconnectMaxMs
    this.manuallyClosed = false
    this.open()
  }

  /** 真正建链 */
  private open(): void {
    if (!this.enabled) return
    if (this.state === 'open' || this.state === 'connecting') return
    this.state = 'connecting'
    const token = getStorage<string>(STORAGE_KEYS.TOKEN)
    const sep = this.url.includes('?') ? '&' : '?'
    const finalUrl = token
      ? `${this.url}${sep}auth=${encodeURIComponent(token)}&token=${encodeURIComponent(token)}`
      : this.url
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

  /** 重连调度（指数退避：2s / 5s / 10s / 30s 上限，无次数上限） */
  private scheduleReconnect(): void {
    if (!this.enabled || this.manuallyClosed) return
    const idx = Math.min(this.reconnectCount, this.reconnectDelays.length - 1)
    const delay = Math.min(this.reconnectDelays[idx], this.reconnectMaxMs)
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
   * 订阅事件（兼容 2 种签名）
   *   - subscribe(topic, handler) → 本地注册 + 上行（向后兼容）
   *   - subscribe(topic)          → 仅上行（W6.B.2 新签名）
   */
  subscribe<T = unknown>(topic: RiderWsTopic | string, handler?: WsHandler<T>): () => void {
    this.sendUpstream('subscribe', topic)
    if (!handler) return () => this.sendUpstream('unsubscribe', topic)
    if (!this.handlers.has(topic)) this.handlers.set(topic, new Set())
    this.handlers.get(topic)?.add(handler as WsHandler)
    return () => this.unsubscribe(topic, handler)
  }

  /** 取消订阅（handler 可选） */
  unsubscribe<T = unknown>(topic: RiderWsTopic | string, handler?: WsHandler<T>): void {
    this.sendUpstream('unsubscribe', topic)
    if (handler) this.handlers.get(topic)?.delete(handler as WsHandler)
  }

  /**
   * 注册事件监听器（W6.B.2：本地订阅，不发上行）
   */
  on<T = unknown>(topic: RiderWsTopic | string, handler: WsHandler<T>): () => void {
    if (!this.handlers.has(topic)) this.handlers.set(topic, new Set())
    this.handlers.get(topic)?.add(handler as WsHandler)
    return () => {
      this.handlers.get(topic)?.delete(handler as WsHandler)
    }
  }

  /** 发送上行控制帧 */
  private sendUpstream(event: string, topic: RiderWsTopic | string): void {
    if (this.state !== 'open' || !this.socket) return
    try {
      this.socket.send({ data: JSON.stringify({ event, topic }) })
    } catch (e) {
      logger.warn('ws.upstream.fail', { event, topic, e: String(e) })
    }
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

/** 读取 env 配置（优先 VITE_WS_URL，向后兼容 VITE_WS_BASE_URL） */
function getWsBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.VITE_WS_URL ?? env?.VITE_WS_BASE_URL ?? ''
}

/**
 * 启动 WebSocket（按需调用，例如登录后或开始接单时）
 * @param riderId 当前骑手 ID（仅做调试，身份认证由 JWT 携带）
 */
export function startWs(riderId?: string | number): void {
  if (ws.isOpen()) return
  const base = getWsBaseUrl()
  if (!base) {
    console.warn('[ws.start.skip] empty VITE_WS_URL')
    ws.connect({ url: '', heartbeatMs: 30_000, reconnectMaxMs: 30_000 })
    return
  }
  const url = `${base}/rider${riderId !== undefined ? `?riderId=${encodeURIComponent(String(riderId))}` : ''}`
  ws.connect({ url, heartbeatMs: 30_000, reconnectMaxMs: 30_000 })
}

/** 关闭 WebSocket（应用进入后台或登出） */
export function stopWs(): void {
  ws.disconnect()
}
