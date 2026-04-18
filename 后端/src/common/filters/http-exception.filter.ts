/**
 * @file http-exception.filter.ts
 * @stage P3/T3.1
 * @desc HttpException 专用过滤器：把所有 HttpException 统一转成
 *       ApiResponse 结构 { code, message, data, traceId, timestamp }
 *       —— 与 AllExceptionsFilter 配合：本 filter 优先捕获 HttpException 子类
 *       (含 BusinessException)，AllExceptionsFilter 兜底未知异常
 * @author 员工 A
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common'
import { Request, Response } from 'express'
import { BizErrorCode, getBizErrorMessage } from '../error-codes'
import { BusinessException } from '../exceptions/business.exception'

/** HTTP 状态码 → 默认业务码映射（兜底用） */
const HTTP_TO_BIZ_CODE: Record<number, number> = {
  [HttpStatus.BAD_REQUEST]: BizErrorCode.PARAM_INVALID,
  [HttpStatus.UNAUTHORIZED]: BizErrorCode.AUTH_TOKEN_INVALID,
  [HttpStatus.FORBIDDEN]: BizErrorCode.AUTH_PERMISSION_DENIED,
  [HttpStatus.NOT_FOUND]: BizErrorCode.BIZ_RESOURCE_NOT_FOUND,
  [HttpStatus.CONFLICT]: BizErrorCode.BIZ_DATA_CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: BizErrorCode.RATE_LIMIT_EXCEEDED,
  [HttpStatus.REQUEST_TIMEOUT]: BizErrorCode.SYSTEM_TIMEOUT,
  [HttpStatus.INTERNAL_SERVER_ERROR]: BizErrorCode.SYSTEM_INTERNAL_ERROR
}

/**
 * HttpException 统一过滤器
 * 功能：业务/校验/认证类异常 → 返回 { code, message, data:null, traceId, timestamp }
 * 参数：exception 由 NestJS 注入（HttpException 实例）；host ArgumentsHost
 * 返回值：无（直接 response.json 返回）
 * 用途：通过 APP_FILTER 注册到 AppModule.providers
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const httpStatus = exception.getStatus()
    const traceId = (request.headers['x-trace-id'] as string | undefined) ?? ''

    let bizCode: number
    let message: string

    if (exception instanceof BusinessException) {
      bizCode = exception.bizCode
      const resp = exception.getResponse() as { bizCode?: number; message?: string }
      message = resp?.message ?? getBizErrorMessage(bizCode)
    } else {
      bizCode = HTTP_TO_BIZ_CODE[httpStatus] ?? BizErrorCode.SYSTEM_INTERNAL_ERROR
      const raw = exception.getResponse()
      if (typeof raw === 'string') {
        message = raw
      } else if (raw && typeof raw === 'object' && 'message' in raw) {
        const m = (raw as { message: unknown }).message
        message = Array.isArray(m) ? m.join('; ') : String(m)
      } else {
        message = exception.message || getBizErrorMessage(bizCode)
      }
    }

    const body = {
      code: bizCode,
      message,
      data: null,
      traceId,
      timestamp: Date.now()
    }

    /* 4xx 用 warn / 5xx 用 error；不打印 token / mobile 等敏感信息 */
    const logLine = `[${request.method}] ${request.url} → http=${httpStatus} biz=${bizCode} msg=${message}`
    if (httpStatus >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logLine, exception.stack)
    } else {
      this.logger.warn(logLine)
    }

    response.status(httpStatus).json(body)
  }
}
