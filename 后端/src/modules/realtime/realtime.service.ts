/**
 * @file realtime.service.ts
 * @stage P9/Sprint 6 (W6.B.1)
 * @desc 实时推送服务：业务模块通过本服务向特定用户 / room / namespace 推送事件
 * @author Agent B (P9 Sprint 6)
 *
 * 设计：
 *   - Gateway 启动后调 setServer 注入底层 Server 实例
 *   - 业务模块（order/dispatch/payment 等）注入 RealtimeService 调推送方法
 *   - 全程 try/catch + logger.warn，永不抛错（推送失败不应影响业务主流程）
 *
 * NestJS WebSocket 文档：https://docs.nestjs.com/websockets/gateways
 *
 * 注意：@nestjs/websockets 未引入，Server / Namespace / Room 接口用本地最小契约替代，
 *       接入 socket.io 后零改动。
 */

import { Injectable, Logger } from '@nestjs/common'

/** 接收 emit 调用的最小契约（socket.io Server / Namespace / BroadcastOperator 都满足） */
export interface EmitterLike {
  emit: (topic: string, payload: unknown) => boolean | void
}

/** 4 个固定 namespace */
export type Namespace = 'admin' | 'user' | 'merchant' | 'rider'

/** Gateway 注入到 Service 的 Server 抽象 */
export interface ServerLike {
  /** 取指定 namespace（如 socket.io: server.of('/admin')） */
  of: (ns: string) => EmitterLike & {
    to: (room: string) => EmitterLike
  }
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name)
  private server: ServerLike | null = null

  /**
   * Gateway afterInit / handleConnection 时注入底层 Server
   * 参数：server ServerLike（socket.io Server 兼容）
   */
  setServer(server: ServerLike | null): void {
    this.server = server
    this.logger.log(server ? 'realtime.server.attached' : 'realtime.server.detached')
  }

  /**
   * 当前 server 是否就绪
   */
  isReady(): boolean {
    return this.server !== null
  }

  /**
   * 向单个用户推送（room: `${userType}:${userId}`）
   * 参数：userType / userId / topic / payload
   * 返回值：是否成功
   */
  pushToUser(
    userType: Namespace,
    userId: string | number,
    topic: string,
    payload: unknown
  ): boolean {
    return this.pushToRoom(userType, `${userType}:${String(userId)}`, topic, payload)
  }

  /**
   * 向指定 namespace 的指定 room 推送
   * 参数：namespace / roomName / topic / payload
   * 返回值：是否成功
   */
  pushToRoom(namespace: Namespace, roomName: string, topic: string, payload: unknown): boolean {
    if (!this.server) {
      this.logger.warn(`realtime.push.skip: server not ready (room=${roomName} topic=${topic})`)
      return false
    }
    try {
      const ns = this.server.of(`/${namespace}`)
      const target = ns.to(roomName)
      target.emit(topic, this.envelope(topic, payload))
      return true
    } catch (err) {
      this.logger.warn(
        `realtime.push.fail: ns=${namespace} room=${roomName} topic=${topic} err=${(err as Error).message}`
      )
      return false
    }
  }

  /**
   * 全 namespace 广播
   * 参数：namespace / topic / payload
   * 返回值：是否成功
   */
  broadcast(namespace: Namespace, topic: string, payload: unknown): boolean {
    if (!this.server) {
      this.logger.warn(`realtime.broadcast.skip: server not ready (topic=${topic})`)
      return false
    }
    try {
      const ns = this.server.of(`/${namespace}`)
      ns.emit(topic, this.envelope(topic, payload))
      return true
    } catch (err) {
      this.logger.warn(
        `realtime.broadcast.fail: ns=${namespace} topic=${topic} err=${(err as Error).message}`
      )
      return false
    }
  }

  /** 统一事件信封（与前端 WsEvent 对齐） */
  private envelope(topic: string, data: unknown): { topic: string; data: unknown; ts: number } {
    return { topic, data, ts: Date.now() }
  }
}
