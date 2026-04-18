import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common'
import { Request, Response } from 'express'
import { BizErrorCode } from '../error-codes'

/**
 * 全局异常过滤器（兜底）
 * 功能：捕获所有未处理异常，统一输出 { code, message, data, traceId, timestamp } 响应体；
 *      P3/T3.1 后 HttpException 由更具体的 HttpExceptionFilter 优先处理，本 filter
 *      仅兜底 *未知非 HttpException* 异常（如 TypeORM/Redis/Buffer 抛出的 Error）。
 * 参数：exception 抛出的异常、host ArgumentsHost 由 NestJS 注入
 * 返回值：无（通过 response 直接写回）
 * 用途：在 AppModule providers 中通过 APP_FILTER 注册（HttpExceptionFilter 之后）
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    let message = '服务器内部错误'
    if (exception instanceof HttpException) {
      const resp = exception.getResponse()
      if (typeof resp === 'string') {
        message = resp
      } else if (resp && typeof resp === 'object' && 'message' in resp) {
        const m = (resp as { message: unknown }).message
        message = Array.isArray(m) ? m.join('; ') : String(m)
      }
    } else if (exception instanceof Error) {
      message = exception.message || message
    }

    /* code 字段：HttpException 用其 status；非 HttpException 用 50001 系统错误（对齐 BizErrorCode） */
    const code =
      exception instanceof HttpException
        ? exception.getStatus() || 1
        : BizErrorCode.SYSTEM_INTERNAL_ERROR

    /* 链路 ID：由 LoggingInterceptor 注入到请求头 */
    const traceId = (request.headers['x-trace-id'] as string | undefined) ?? ''

    const body = {
      code,
      message,
      data: null,
      traceId,
      httpStatus: status,
      path: request.url,
      timestamp: Date.now()
    }

    this.logger.error(
      `[${request.method}] ${request.url} → ${status} ${message} trace=${traceId}`,
      exception instanceof Error ? exception.stack : undefined
    )

    response.status(status).json(body)
  }
}
