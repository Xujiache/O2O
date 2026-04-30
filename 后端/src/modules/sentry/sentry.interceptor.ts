/**
 * @file sentry.interceptor.ts
 * @stage P9/W2.C.1 (Sprint 2)
 * @desc 全局 Sentry 异常拦截器 — 仅捕获 5xx / 未捕获异常并附加 traceId/userId/userType。
 *
 * 设计要点：
 *   - 4xx（业务异常）不上报，避免 Sentry 噪声
 *   - 通过 catchError 复用 rxjs，不破坏原异常流
 *   - 与 LoggingInterceptor 共用 x-trace-id 头
 *
 * @author Agent C (P9 Sprint 2)
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Request } from 'express'
import { Observable, throwError } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { SentryService } from './sentry.service'

/** 带认证元数据的请求（auth 模块挂载到 req.user） */
interface AuthenticatedRequest extends Request {
  user?: { uid?: string; userType?: string }
  traceId?: string
}

/**
 * Sentry 拦截器
 * 功能：捕获下游 5xx，调用 SentryService.captureException 并继续抛出原错误
 * 用途：在 SentryModule 中以 APP_INTERCEPTOR 注册为全局拦截器
 */
@Injectable()
export class SentryInterceptor implements NestInterceptor {
  constructor(private readonly sentry: SentryService) {}

  /**
   * 拦截入口
   * @param context Nest 执行上下文
   * @param next 下游 handler
   * @returns 不变的下游 Observable（仅在异常分支多了一次上报）
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        const status = this.extractStatus(err)
        if (status >= 500) {
          const req = context.switchToHttp().getRequest<AuthenticatedRequest>()
          const traceId =
            req.traceId ?? (req.headers['x-trace-id'] as string | undefined) ?? undefined
          this.sentry.captureException(err, {
            traceId,
            userId: req.user?.uid,
            userType: req.user?.userType,
            path: req.url,
            method: req.method,
            status
          })
        }
        return throwError(() => err)
      })
    )
  }

  /**
   * 从未知异常对象提取 HTTP 状态码（兼容 HttpException / Error / 普通对象）
   * @param err 抛出的对象
   * @returns 状态码（无法识别时默认 500）
   */
  private extractStatus(err: unknown): number {
    if (err && typeof err === 'object') {
      const e = err as { status?: unknown; getStatus?: () => number }
      if (typeof e.getStatus === 'function') {
        try {
          return e.getStatus()
        } catch {
          /* 忽略，回退 status 字段 */
        }
      }
      if (typeof e.status === 'number') return e.status
    }
    return 500
  }
}
