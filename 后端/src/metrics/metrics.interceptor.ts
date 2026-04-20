import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { InjectMetric } from '@willsoto/nestjs-prometheus'
import { Counter, Histogram } from 'prom-client'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { Request, Response } from 'express'

/**
 * Prometheus 指标拦截器
 * 功能：自动记录每个 HTTP 请求的延迟（Histogram）和计数（Counter）
 * 用途：在 AppModule providers 中通过 APP_INTERCEPTOR 注册
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly httpRequestsTotal: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private readonly httpDuration: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>()
    const { method, route } = req
    // 使用路由模板而非实际路径，避免高基数
    const path = route?.path || req.url
    const timer = this.httpDuration.startTimer({ method, path })

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>()
          const status = String(res.statusCode)
          timer({ status })
          this.httpRequestsTotal.inc({ method, path, status })
        },
        error: (err) => {
          const status = err?.status || err?.statusCode || '500'
          timer({ status: String(status) })
          this.httpRequestsTotal.inc({ method, path, status: String(status) })
        },
      }),
    )
  }
}
