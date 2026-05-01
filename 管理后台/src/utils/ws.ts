/**
 * @file ws.ts
 * @stage P9/Sprint 6 W6.B.2（管理后台 WS 客户端）
 * @desc 接通后端 RealtimeGateway（namespace=/admin）的浏览器原生 WebSocket 封装
 *
 * 设计要点：
 *   - 不依赖 socket.io-client（项目未安装；不可 pnpm add）
 *   - 用浏览器原生 WebSocket
 *   - 心跳 30s（发送 'ping' 字符串，收到任意 pong 重置）
 *   - 自动重连指数退避：2s / 5s / 10s / 30s 上限，无次数上限
 *   - 缺 VITE_WS_URL 时 enabled=false + console.warn（与 sentry.ts 一致）
 *
 * 与后端 Gateway 的握手协议（与 4 端约定）：
 *   - URL：${VITE_WS_URL}/admin?auth=<jwt>&token=<jwt>
 *   - 上行控制帧：{ event: 'subscribe' | 'unsubscribe' | 'ping', topic?: string }
 *   - 下行事件帧：{ topic, data, ts, traceId? }
 *   - 心跳：上行 'ping' 字符串 → 下行 'pong' 字符串或 { type: 'pong', ts } JSON
 *
 * @author Agent B (P9 Sprint 6)
 */

/** 后端推送事件主题 */
export type AdminWsTopic =
  | 'admin:order:abnormal'
  | 'admin:rider:emergency'
  | 'admin:complaint:new'
  | 'admin:withdraw:apply'
  | 'admin:audit:pending'
  | 'admin:metric:alarm'
  | 'admin:message:new'

/** 单条事件 */
export interface WsEvent<T = unknown> {
  topic: AdminWsTopic | string
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
  reconnectMaxMs?: number
}

type WsState = 'idle' | 'connecting' | 'open' | 'closing' | 'closed'

class AdminWsClient {
  private socket: WebSocket | null = null
  private state: WsState = 'idle'
  private url = ''
  private heartbeatMs = 30_000
  /** 重连延迟阶梯 2s/5s/10s/30s，无次数上限 */
  private reconnectDelays = [2_000, 5_000, 10_000, 30_000]
  private reconnectMaxMs = 30_000
  private reconnectCount = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private handlers: Map<string, Set<WsHandler>> = new Map()
  private manuallyClosed = false
  private enabled = true

  /**
   * 建立连接（jwt + userType 组合）
   * @param jwt 当前管理员的 JWT（为空也允许，但鉴权将失败）
   * @param userType 命名空间（默认 admin）
   */
  connect(jwt: string, userType: 'admin' | 'user' | 'merchant' | 'rider' = 'admin'): void {
    const base = readEnvUrl()
    if (!base) {
      this.enabled = false
      console.warn('[ws.init.skip] empty VITE_WS_URL')
      return
    }
    const sep = '?'
    const auth = jwt ? `${sep}auth=${encodeURIComponent(jwt)}&token=${encodeURIComponent(jwt)}` : ''
    this.openWith({ url: `${base}/${userType}${auth}` })
  }

  /** 用显式 url 连接（测试 / 自定义场景） */
  openWith(opt: WsOptions): void {
    if (!opt.url) {
      this.enabled = false
      console.warn('[ws.init.skip] empty url')
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
    try {
      this.socket = new WebSocket(this.url)
      this.socket.onopen = (): void => {
        this.state = 'open'
        this.reconnectCount = 0
        this.startHeartbeat()
        console.warn('[ws.open]', this.url)
      }
      this.socket.onmessage = (ev: MessageEvent): void => {
        const raw = ev.data
        if (typeof raw !== 'string') return
        if (raw === 'pong' || raw === '{"type":"pong"}') return
        try {
          const parsed = JSON.parse(raw) as WsEvent | { type?: string }
          if ((parsed as { type?: string }).type === 'pong') return
          const event = parsed as WsEvent
          if (event && typeof event.topic === 'string') {
            this.dispatch(event)
          }
        } catch (e) {
          console.warn('[ws.parse.fail]', String(e))
        }
      }
      this.socket.onerror = (ev: Event): void => {
        console.warn('[ws.error]', String((ev as ErrorEvent).message ?? ''))
      }
      this.socket.onclose = (): void => {
        this.state = 'closed'
        this.stopHeartbeat()
        if (!this.manuallyClosed) this.scheduleReconnect()
      }
    } catch (e) {
      this.state = 'closed'
      console.warn('[ws.connect.fail]', String(e))
      this.scheduleReconnect()
    }
  }

  /** 启动心跳（30s 默认） */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== 'open' || !this.socket) return
      try {
        this.socket.send('ping')
      } catch (e) {
        console.warn('[ws.heartbeat.fail]', String(e))
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

  /** 重连调度（指数退避：2s / 5s / 10s / 30s 上限） */
  private scheduleReconnect(): void {
    if (!this.enabled || this.manuallyClosed) return
    if (this.reconnectTimer) return
    const idx = Math.min(this.reconnectCount, this.reconnectDelays.length - 1)
    const delay = Math.min(this.reconnectDelays[idx], this.reconnectMaxMs)
    this.reconnectCount += 1
    console.warn('[ws.reconnect.schedule]', { delayMs: delay, attempt: this.reconnectCount })
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.manuallyClosed) this.open()
    }, delay)
  }

  /** 主动断开 */
  disconnect(): void {
    this.manuallyClosed = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      try {
        this.socket.close(1000, 'normal')
      } catch (e) {
        console.warn('[ws.close.fail]', String(e))
      }
      this.socket = null
    }
    this.state = 'closed'
  }

  /**
   * 上行订阅 topic（W6.B.2 必备 API）
   * @param topic 主题
   */
  subscribe(topic: AdminWsTopic | string): void {
    this.sendUpstream('subscribe', topic)
  }

  /**
   * 上行取消订阅
   * @param topic 主题
   */
  unsubscribe(topic: AdminWsTopic | string): void {
    this.sendUpstream('unsubscribe', topic)
  }

  /**
   * 注册事件监听器（本地）
   * @param topic 事件名
   * @param handler 回调
   * @returns 取消监听函数
   */
  on<T = unknown>(topic: AdminWsTopic | string, handler: WsHandler<T>): () => void {
    if (!this.handlers.has(topic)) this.handlers.set(topic, new Set())
    this.handlers.get(topic)?.add(handler as WsHandler)
    return () => {
      this.handlers.get(topic)?.delete(handler as WsHandler)
    }
  }

  /** 移除事件监听器 */
  off<T = unknown>(topic: AdminWsTopic | string, handler: WsHandler<T>): void {
    this.handlers.get(topic)?.delete(handler as WsHandler)
  }

  /** 发送上行控制帧 */
  private sendUpstream(event: string, topic?: string): void {
    if (this.state !== 'open' || !this.socket) return
    try {
      this.socket.send(JSON.stringify({ event, topic }))
    } catch (e) {
      console.warn('[ws.upstream.fail]', { event, topic, e: String(e) })
    }
  }

  /** 派发事件到本地订阅者 */
  private dispatch(event: WsEvent): void {
    const set = this.handlers.get(event.topic)
    if (!set) return
    for (const fn of set) {
      try {
        fn(event)
      } catch (e) {
        console.warn('[ws.handler.error]', { topic: event.topic, e: String(e) })
      }
    }
  }

  /** 当前是否已连接 */
  isOpen(): boolean {
    return this.state === 'open'
  }
}

/** 读取 VITE_WS_URL（与 sentry.ts 同风格的 import.meta.env 读取） */
function readEnvUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env
    return env?.VITE_WS_URL ?? ''
  } catch {
    return ''
  }
}

/** 全局单例 */
export const ws = new AdminWsClient()

/**
 * 启动 WebSocket（管理员登录后调用）
 * @param jwt 管理员 JWT
 */
export function startWs(jwt: string): void {
  if (ws.isOpen()) return
  ws.connect(jwt, 'admin')
}

/** 关闭 WebSocket（退出登录 / 切换账号） */
export function stopWs(): void {
  ws.disconnect()
}
