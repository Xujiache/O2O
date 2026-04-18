import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common'
import { Request, Response } from 'express'

/**
 * 全局异常过滤器
 * 功能：捕获所有未处理异常，统一输出 { code, message, data, timestamp } 响应体
 * 参数：exception 抛出的异常、host ArgumentsHost 由 NestJS 注入
 * 返回值：无（通过 response 直接写回）
 * 用途：在 main.ts 中通过 app.useGlobalFilters(new AllExceptionsFilter()) 注册
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR

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

    // I-11：code 字段语义统一
    // - HttpException：用其 HTTP 状态码；若异常主动返回 0 则兜底为 1（绝不与成功语义混淆）
    // - 非 HttpException（未捕获异常）：兜底为 1000
    // 同时保留独立 httpStatus 字段，便于前端区分业务 code 与 HTTP 层状态
    const code =
      exception instanceof HttpException ? exception.getStatus() || 1 : 1000

    const body = {
      code,
      message,
      data: null,
      httpStatus: status,
      path: request.url,
      timestamp: Date.now()
    }

    this.logger.error(
      `[${request.method}] ${request.url} → ${status} ${message}`,
      exception instanceof Error ? exception.stack : undefined
    )

    response.status(status).json(body)
  }
}
