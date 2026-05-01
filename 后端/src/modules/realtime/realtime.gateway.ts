/**
 * @file realtime.gateway.ts
 * @stage P9/Sprint 6 (W6.B.1)
 * @desc NestJS WebSocket Gateway：4 个 namespace（/admin /user /merchant /rider）
 * @author Agent B (P9 Sprint 6)
 *
 * 行为：
 *   - handleConnection(client)：调 WsJwtGuard 验 JWT，通过 → join room ${userType}:${userId}
 *     失败 → client.disconnect(true)
 *   - handleDisconnect：日志记录
 *   - 事件 subscribe / unsubscribe / ping（pong 响应）
 *
 * 实现说明：
 *   本仓库未安装 @nestjs/websockets / socket.io，因此本 Gateway 不使用框架装饰器，
 *   改为提供等价钩子方法（handleConnection / handleDisconnect / handleSubscribe /
 *   handleUnsubscribe / handlePing），由真实 server 启动时（main.ts 后续接入）调用，
 *   或被 RealtimeService 直接驱动。
 *   接入 @nestjs/websockets 时，可在类上加 @WebSocketGateway 并把方法换成 @SubscribeMessage。
 *
 * NestJS WebSocket 文档：https://docs.nestjs.com/websockets/gateways
 */

import { Injectable, Logger } from '@nestjs/common'
import type { JwtPayload } from '../auth/strategies/jwt.strategy'
import { WsClientLike, WsException, WsJwtGuard } from './guards/ws-jwt.guard'
import { Namespace, RealtimeService, ServerLike } from './realtime.service'

/** 客户端订阅 / ping 消息体 */
export interface SubscribePayload {
  topic: string
}

/** Gateway 客户端契约（在 WsClientLike 基础上补 socket.io 常用方法） */
export interface GatewayClient extends WsClientLike {
  id?: string
  nsp?: { name?: string }
  join: (room: string) => void | Promise<void>
  leave: (room: string) => void | Promise<void>
  emit: (event: string, payload?: unknown) => boolean | void
  disconnect: (close?: boolean) => void
}

/** 4 个允许的 namespace 集合 */
const NAMESPACES: ReadonlyArray<Namespace> = ['admin', 'user', 'merchant', 'rider']

@Injectable()
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name)

  constructor(
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly realtimeService: RealtimeService
  ) {}

  /**
   * server 实例就绪后由外部调用一次（main.ts 接入 socket.io 后注入）
   * 参数：server ServerLike
   */
  afterInit(server: ServerLike | null): void {
    this.realtimeService.setServer(server)
    this.logger.log(`realtime.gateway.afterInit: namespaces=${NAMESPACES.join(',')}`)
  }

  /**
   * 客户端连接钩子
   * 参数：client GatewayClient
   * 返回值：true 已加入房间 / false 已断开
   */
  async handleConnection(client: GatewayClient): Promise<boolean> {
    try {
      await this.wsJwtGuard.verifyClient(client)
      const user = client.data?.user as JwtPayload | undefined
      if (!user) {
        this.logger.warn(`ws.connect.reject: no user`)
        client.disconnect(true)
        return false
      }
      const ns = this.namespaceOf(client)
      if (!ns) {
        this.logger.warn(`ws.connect.reject: invalid namespace (${client.nsp?.name ?? '?'})`)
        client.disconnect(true)
        return false
      }
      if (ns !== user.userType) {
        this.logger.warn(
          `ws.connect.reject: namespace mismatch (ns=${ns}, userType=${user.userType})`
        )
        client.disconnect(true)
        return false
      }
      const room = `${user.userType}:${user.uid}`
      await client.join(room)
      this.logger.log(`ws.connect.ok: id=${client.id ?? '?'} ns=${ns} room=${room}`)
      return true
    } catch (err) {
      const msg = err instanceof WsException ? err.message : (err as Error).message
      this.logger.warn(`ws.connect.fail: ${msg}`)
      try {
        client.disconnect(true)
      } catch {
        /* ignore */
      }
      return false
    }
  }

  /**
   * 客户端断开钩子
   * 参数：client GatewayClient
   */
  handleDisconnect(client: GatewayClient): void {
    this.logger.log(`ws.disconnect: id=${client.id ?? '?'} ns=${client.nsp?.name ?? '?'}`)
  }

  /**
   * 订阅事件 topic（room = `${userType}:${uid}:${topic}`）
   * 参数：client GatewayClient / payload SubscribePayload
   * 返回值：ack { ok, topic }
   */
  async handleSubscribe(
    client: GatewayClient,
    payload: SubscribePayload
  ): Promise<{ ok: boolean; topic: string; reason?: string }> {
    const topic = this.sanitizeTopic(payload?.topic)
    if (!topic) return { ok: false, topic: '', reason: 'invalid topic' }
    const user = client.data?.user as JwtPayload | undefined
    if (!user) return { ok: false, topic, reason: 'unauthenticated' }
    try {
      await client.join(this.topicRoom(user, topic))
      return { ok: true, topic }
    } catch (err) {
      this.logger.warn(`ws.subscribe.fail: topic=${topic} err=${(err as Error).message}`)
      return { ok: false, topic, reason: 'join failed' }
    }
  }

  /**
   * 取消订阅
   * 参数：client / payload
   * 返回值：ack { ok, topic }
   */
  async handleUnsubscribe(
    client: GatewayClient,
    payload: SubscribePayload
  ): Promise<{ ok: boolean; topic: string }> {
    const topic = this.sanitizeTopic(payload?.topic)
    if (!topic) return { ok: false, topic: '' }
    const user = client.data?.user as JwtPayload | undefined
    if (!user) return { ok: false, topic }
    try {
      await client.leave(this.topicRoom(user, topic))
      return { ok: true, topic }
    } catch (err) {
      this.logger.warn(`ws.unsubscribe.fail: topic=${topic} err=${(err as Error).message}`)
      return { ok: false, topic }
    }
  }

  /**
   * 心跳响应
   * 参数：client
   * 返回值：pong 帧
   */
  handlePing(client: GatewayClient): { type: 'pong'; ts: number } {
    const pong = { type: 'pong' as const, ts: Date.now() }
    try {
      client.emit('pong', pong)
    } catch (err) {
      this.logger.warn(`ws.ping.emit.fail: ${(err as Error).message}`)
    }
    return pong
  }

  /** 从 client.nsp.name（如 '/admin'）取 namespace */
  private namespaceOf(client: GatewayClient): Namespace | null {
    const raw = client.nsp?.name ?? ''
    const trimmed = raw.replace(/^\/+/, '')
    return (NAMESPACES as ReadonlyArray<string>).includes(trimmed) ? (trimmed as Namespace) : null
  }

  /** topic 脱敏：仅允许 [a-zA-Z0-9:_-.] */
  private sanitizeTopic(t: unknown): string {
    if (typeof t !== 'string') return ''
    if (t.length === 0 || t.length > 128) return ''
    return /^[a-zA-Z0-9:_.-]+$/.test(t) ? t : ''
  }

  /** topic 房间名 */
  private topicRoom(user: JwtPayload, topic: string): string {
    return `${user.userType}:${user.uid}:${topic}`
  }
}
