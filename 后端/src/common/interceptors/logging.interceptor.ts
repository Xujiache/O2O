import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { Request, Response } from 'express'

/**
 * 全局日志拦截器（P3/T3.1 升级：注入 X-Trace-Id 供下游链路追踪）
 * 功能：记录每次 HTTP 请求的方法、路径、耗时；如请求头无 x-trace-id 则生成 12 位短 ID
 *      并写回到 request.headers + response header，便于 TransformInterceptor / 日志聚合
 * 参数：context、next 由 NestJS 注入
 * 返回值：Observable<unknown>
 * 用途：在 AppModule providers 中通过 APP_INTERCEPTOR 注册
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>()
    const res = context.switchToHttp().getResponse<Response>()
    const { method, url } = req

    /* P3/T3.1：链路追踪 ID 注入。优先取请求头 x-trace-id，缺省则生成 12 位短 UUID */
    let traceId = req.headers['x-trace-id'] as string | undefined
    if (!traceId) {
      traceId = randomUUID().replace(/-/g, '').slice(0, 12)
      req.headers['x-trace-id'] = traceId
    }
    res.setHeader('X-Trace-Id', traceId)

    const start = Date.now()

    return next.handle().pipe(
      tap({
        next: () => {
          const cost = Date.now() - start
          this.logger.log(`[${method}] ${url} +${cost}ms trace=${traceId}`)
        },
        error: (err) => {
          const cost = Date.now() - start
          const msg =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : String(err)
          this.logger.warn(`[${method}] ${url} +${cost}ms trace=${traceId} ERR=${msg}`)
        }
      })
    )
  }
}
