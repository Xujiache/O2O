/**
 * @file ws-jwt.guard.ts
 * @stage P9/Sprint 6 (W6.B.1)
 * @desc 独立 WebSocket JWT 鉴权守卫（不复用 HTTP JwtAuthGuard）
 * @author Agent B (P9 Sprint 6)
 *
 * 行为：
 *   - canActivate 从 client.handshake.auth.token / handshake.query.token / handshake.headers.authorization 取 JWT
 *   - 用 JwtService.verifyAsync 验签（HS512 + JWT_SECRET，与 auth.module 一致）
 *   - 失败 → throw WsException
 *
 * NestJS WebSocket 文档：https://docs.nestjs.com/websockets/gateways
 *
 * 注意：本项目 @nestjs/websockets 未引入，因此 WsException 用本地等价类替代。
 *       当真正接入 @nestjs/websockets 时，可一行替换 import 即可。
 */

import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { JwtPayload } from '../../auth/strategies/jwt.strategy'

/**
 * 本地 WsException（与 @nestjs/websockets 同名 class 等价）
 * 用法：throw new WsException('message')
 */
export class WsException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WsException'
  }
}

/** WS 客户端最小握手契约（兼容 socket.io.Socket / 浏览器原生升级请求） */
export interface WsClientLike {
  handshake?: {
    auth?: { token?: string }
    query?: { token?: string | string[] }
    headers?: Record<string, string | string[] | undefined>
  }
  /** 鉴权通过后，gateway 把解出的 payload 挂到 client.data.user */
  data?: { user?: JwtPayload } & Record<string, unknown>
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name)

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  /**
   * Nest CanActivate 入口
   * 参数：ctx ExecutionContext（switchToWs().getClient<WsClientLike>()）
   * 返回值：true（鉴权通过）/ throw WsException
   */
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const client = this.extractClient(ctx)
    return this.verifyClient(client)
  }

  /**
   * 直接验证 client（连接钩子使用，不依赖 ExecutionContext）
   * 参数：client WS 客户端
   * 返回值：true / throw WsException
   */
  async verifyClient(client: WsClientLike): Promise<boolean> {
    const token = this.extractToken(client)
    if (!token) {
      throw new WsException('未提供 JWT')
    }
    const secret = this.config.get<string>('jwt.secret')
    if (!secret) {
      throw new WsException('JWT 配置缺失')
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret,
        algorithms: ['HS512']
      })
      if (!payload?.uid || !payload?.userType) {
        throw new WsException('JWT payload 字段缺失')
      }
      if (!client.data) {
        client.data = {}
      }
      client.data.user = payload
      return true
    } catch (err) {
      if (err instanceof WsException) throw err
      const msg = (err as Error)?.message ?? '验签失败'
      this.logger.warn(`ws.jwt.verify.fail: ${msg}`)
      throw new WsException(`JWT 无效: ${msg}`)
    }
  }

  /** ExecutionContext → client */
  private extractClient(ctx: ExecutionContext): WsClientLike {
    try {
      const ws = ctx.switchToWs()
      return ws.getClient<WsClientLike>()
    } catch {
      const args = ctx.getArgs<unknown[]>()
      return (args?.[0] as WsClientLike) ?? {}
    }
  }

  /** 从 handshake 取 token，优先级：auth.token > query.token > headers.authorization (Bearer) */
  private extractToken(client: WsClientLike): string | null {
    const hs = client?.handshake
    if (!hs) return null
    const authToken = hs.auth?.token
    if (typeof authToken === 'string' && authToken.length > 0) return authToken

    const q = hs.query?.token
    if (typeof q === 'string' && q.length > 0) return q
    if (Array.isArray(q) && q[0]) return q[0]

    const auth = hs.headers?.authorization
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7)
    }
    return null
  }
}
