/**
 * @file operation-log.interceptor.ts
 * @stage P9 Sprint 3 / W3.D.1
 * @desc Admin 写操作自动埋点拦截器（POST/PUT/DELETE）
 * @author Sprint3-Agent D
 *
 * 行为：
 *   1. 仅拦截 path 以 /admin 开头（含 /api/v1/admin 等前缀）的写请求
 *   2. method ∈ {POST, PUT, PATCH, DELETE} 才记录；GET/HEAD/OPTIONS 直接放行
 *   3. 路径白名单（敏感端点不记 payload，仅 method+path）：
 *        - /admin/auth/login 及其变体（/api/v1/admin/auth/login、/admin/login）
 *   4. 异步落盘：next.handle().pipe(tap(...))；service 自身吞异常，不阻断业务
 *   5. SUCCESS / FAIL 通过响应订阅 next/error 双路径区分
 */

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { OperationLogService } from './services/operation-log.service'

/** 写操作 method 白名单 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * 敏感路径（命中则不写 payload，仅记 method+path）
 *   匹配方式：path.includes(piece)
 */
const SENSITIVE_PATH_PIECES = ['/admin/auth/login', '/admin/login']

/** request.user JWT payload（与 AuthUser 对齐子集） */
interface RequestUserLike {
  uid?: string
  username?: string
  nickname?: string
}

/**
 * Express-like Request 子集（避免硬依赖具体框架类型）
 */
interface AdminRequestLike {
  method: string
  url: string
  path?: string
  originalUrl?: string
  baseUrl?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  ip?: string
  user?: RequestUserLike
  socket?: { remoteAddress?: string }
}

/**
 * Admin 操作日志拦截器
 */
@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OperationLogInterceptor.name)

  constructor(private readonly opLog: OperationLogService) {}

  /**
   * 拦截入口
   * 参数：context / next
   * 返回值：透传 next.handle()；非业务路径直接 return
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = this.extractRequest(context)
    if (!req) return next.handle()

    const method = String(req.method ?? '').toUpperCase()
    if (!WRITE_METHODS.has(method)) {
      return next.handle()
    }

    const fullPath = this.extractPath(req)
    if (!this.isAdminPath(fullPath)) {
      return next.handle()
    }

    const isSensitive = this.isSensitivePath(fullPath)
    const ip = this.extractIp(req)
    const userAgent = this.toStringHeader(req.headers['user-agent'])
    const traceId = this.toStringHeader(req.headers['x-trace-id'])
    const body = isSensitive ? undefined : this.toPlainObject(req.body)
    const adminId = req.user?.uid ?? ''
    const adminName = req.user?.nickname ?? req.user?.username
    const action = this.deriveAction(method, fullPath)
    const resource = this.deriveResource(fullPath)

    return next.handle().pipe(
      tap({
        next: () => {
          this.fireAndForget({
            adminId,
            adminName,
            action,
            resource,
            method,
            path: fullPath,
            payload: body,
            result: 'SUCCESS',
            ip,
            userAgent,
            traceId
          })
        },
        error: (err: unknown) => {
          this.fireAndForget({
            adminId,
            adminName,
            action,
            resource,
            method,
            path: fullPath,
            payload: body,
            result: 'FAIL',
            errorMsg: err instanceof Error ? err.message : String(err),
            ip,
            userAgent,
            traceId
          })
        }
      })
    )
  }

  /**
   * 启动写日志的异步任务（不返回 Promise，避免阻断）
   */
  private fireAndForget(input: Parameters<OperationLogService['writeLog']>[0]): void {
    void this.opLog.writeLog(input).catch((err: unknown) => {
      this.logger.warn(
        `[OPLOG-INTERCEPTOR] writeLog 失败 path=${input.path} err=${err instanceof Error ? err.message : String(err)}`
      )
    })
  }

  /**
   * 取 HTTP request；非 HTTP 上下文（如 RPC / WebSocket）返回 null
   */
  private extractRequest(context: ExecutionContext): AdminRequestLike | null {
    try {
      if (context.getType() !== 'http') return null
      return context.switchToHttp().getRequest<AdminRequestLike>()
    } catch {
      return null
    }
  }

  /**
   * 提取实际 path（去掉 query；优先用 path / url；回退 originalUrl）
   */
  private extractPath(req: AdminRequestLike): string {
    const raw = req.path ?? req.originalUrl ?? req.url ?? ''
    const queryIdx = raw.indexOf('?')
    return queryIdx >= 0 ? raw.slice(0, queryIdx) : raw
  }

  /** 是否属于 admin 业务路径 */
  private isAdminPath(path: string): boolean {
    return path.includes('/admin/') || path.endsWith('/admin')
  }

  /** 是否敏感路径（不记 payload） */
  private isSensitivePath(path: string): boolean {
    return SENSITIVE_PATH_PIECES.some((p) => path.includes(p))
  }

  /** 提取 IP（X-Forwarded-For 第一个；回退 req.ip / socket） */
  private extractIp(req: AdminRequestLike): string | undefined {
    const xff = this.toStringHeader(req.headers['x-forwarded-for'])
    if (xff) {
      const first = xff.split(',')[0]?.trim()
      if (first) return first
    }
    if (req.ip) return req.ip
    return req.socket?.remoteAddress
  }

  /**
   * header 取值统一为单字符串
   */
  private toStringHeader(v: string | string[] | undefined): string | undefined {
    if (Array.isArray(v)) return v[0]
    return v ?? undefined
  }

  /**
   * body → 普通对象（避免 Buffer / Stream 直接落库）
   */
  private toPlainObject(body: unknown): Record<string, unknown> | undefined {
    if (body === null || body === undefined) return undefined
    if (typeof body !== 'object') return { value: body as unknown }
    if (Array.isArray(body)) return { items: body as unknown[] }
    return body as Record<string, unknown>
  }

  /**
   * action 推导：method + 末段
   */
  private deriveAction(method: string, path: string): string {
    const segs = path.replace(/^\/+/, '').split('/').filter(Boolean)
    const last = segs[segs.length - 1] ?? ''
    /* 末段若是数字 ID（resourceId），取倒数第二段 */
    const tail = /^\d+$/.test(last) ? (segs[segs.length - 2] ?? '') : last
    if (tail) return `${method.toLowerCase()}:${tail}`
    return method.toLowerCase()
  }

  /**
   * resource 推导：取 /admin/{resource}/...
   */
  private deriveResource(path: string): string {
    const segs = path.replace(/^\/+/, '').split('/').filter(Boolean)
    const idx = segs.indexOf('admin')
    if (idx >= 0 && segs[idx + 1]) return segs[idx + 1]!
    return 'admin'
  }
}
