import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { Request } from 'express'

/**
 * 全局日志拦截器
 * 功能：记录每次 HTTP 请求的方法、路径、耗时，便于调试与接口监控
 * 参数：context、next 由 NestJS 注入
 * 返回值：Observable<unknown>
 * 用途：在 main.ts 中 app.useGlobalInterceptors(new LoggingInterceptor()) 注册
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>()
    const { method, url } = req
    const start = Date.now()

    return next.handle().pipe(
      tap({
        next: () => {
          const cost = Date.now() - start
          this.logger.log(`[${method}] ${url} +${cost}ms`)
        },
        error: (err) => {
          const cost = Date.now() - start
          this.logger.warn(`[${method}] ${url} +${cost}ms ERR=${err?.message ?? err}`)
        }
      })
    )
  }
}
