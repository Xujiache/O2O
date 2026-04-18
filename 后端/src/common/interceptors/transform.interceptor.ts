import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Request } from 'express'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

/**
 * 统一响应体结构（P3/T3.1 升级：追加 traceId 字段，对齐 DESIGN_P3 §7.1）
 */
export interface StandardResponse<T> {
  code: number
  message: string
  data: T
  traceId: string
  timestamp: number
}

/**
 * 全局响应体转换拦截器
 * 功能：把 controller 返回的业务数据包装成 { code, message, data, traceId, timestamp }
 * 参数：context、next 由 NestJS 注入
 * 返回值：Observable<StandardResponse<T>>
 * 用途：在 main.ts 中 app.useGlobalInterceptors(new TransformInterceptor()) 注册
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, StandardResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<StandardResponse<T>> {
    const req = context.switchToHttp().getRequest<Request>()
    const traceId = (req.headers['x-trace-id'] as string | undefined) ?? ''
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'ok',
        data,
        traceId,
        timestamp: Date.now()
      }))
    )
  }
}
