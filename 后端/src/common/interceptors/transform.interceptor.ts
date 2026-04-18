import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

/**
 * 统一响应体结构
 */
export interface StandardResponse<T> {
  code: number
  message: string
  data: T
  timestamp: number
}

/**
 * 全局响应体转换拦截器
 * 功能：把 controller 返回的业务数据包装成 { code, message, data, timestamp }
 * 参数：context、next 由 NestJS 注入
 * 返回值：Observable<StandardResponse<T>>
 * 用途：在 main.ts 中 app.useGlobalInterceptors(new TransformInterceptor()) 注册
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, StandardResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<StandardResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'ok',
        data,
        timestamp: Date.now()
      }))
    )
  }
}
