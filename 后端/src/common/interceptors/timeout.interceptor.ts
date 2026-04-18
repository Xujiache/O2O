/**
 * @file timeout.interceptor.ts
 * @stage P3/T3.1
 * @desc 全局请求超时拦截器，默认 10s 触发 RequestTimeoutException
 * @author 员工 A
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException
} from '@nestjs/common'
import { Observable, throwError, TimeoutError } from 'rxjs'
import { catchError, timeout } from 'rxjs/operators'

/** 默认超时（ms），与 DESIGN_P3 §7.1 保持一致 */
const DEFAULT_TIMEOUT_MS = 10_000

/**
 * 请求超时拦截器
 * 功能：单个请求处理超过 N ms 触发 408 / SYSTEM_TIMEOUT；防慢接口拖垮线程池
 * 参数：context、next 由 NestJS 注入
 * 返回值：Observable<unknown>
 * 用途：在 AppModule providers 中通过 APP_INTERCEPTOR 注册
 *
 * 长流（如文件上传、SSE）应在对应 controller 上使用 @Sse 或自定义跳过策略；
 * 本 interceptor 仅作用于普通 REST。
 *
 * 设计注意：构造函数无参数，避免 NestJS DI 容器误把 number 默认参数当作
 * 待注入 provider；超时阈值以 readonly 字段直接初始化（如需可配置，
 * 应改为 useFactory 注入 ConfigService 后取值）。
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  /** 超时阈值（ms），与 DESIGN_P3 §7.1 默认值 10s 对齐 */
  private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err: unknown) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException('请求超时'))
        }
        return throwError(() => err)
      })
    )
  }
}
