/**
 * @file business.exception.ts
 * @stage P3/T3.1
 * @desc 自定义业务异常类，承载业务错误码 + HTTP 状态码 + 自定义 message
 * @author 员工 A
 */

import { HttpException, HttpStatus } from '@nestjs/common'
import { BizErrorCode, getBizErrorMessage } from '../error-codes'

/**
 * 业务异常
 * 功能：业务层主动抛出错误时使用，由 HttpExceptionFilter 捕获并按业务编码封装响应
 * 参数：bizCode 业务错误码（取自 BizErrorCode）；message 可选自定义消息；httpStatus 可选 HTTP 状态码（默认 200，业务错误以 200+code 区分）
 * 返回值：BusinessException 实例
 * 用途：throw new BusinessException(BizErrorCode.AUTH_LOGIN_LOCKED)
 */
export class BusinessException extends HttpException {
  /** 业务错误码（与 HTTP 状态码区分） */
  readonly bizCode: number

  constructor(bizCode: number, message?: string, httpStatus: HttpStatus = HttpStatus.OK) {
    const finalMessage = message ?? getBizErrorMessage(bizCode)
    super({ bizCode, message: finalMessage }, httpStatus)
    this.bizCode = bizCode
  }

  /**
   * 快捷构造：参数错误（10001）
   * 参数：message 自定义消息（可选）
   * 返回值：BusinessException
   */
  static paramInvalid(message?: string): BusinessException {
    return new BusinessException(BizErrorCode.PARAM_INVALID, message, HttpStatus.BAD_REQUEST)
  }

  /**
   * 快捷构造：未登录 / token 缺失（20001）
   * 参数：message 自定义消息（可选）
   * 返回值：BusinessException
   */
  static unauthorized(message?: string): BusinessException {
    return new BusinessException(BizErrorCode.AUTH_TOKEN_MISSING, message, HttpStatus.UNAUTHORIZED)
  }

  /**
   * 快捷构造：权限不足（20003）
   * 参数：message 自定义消息（可选）
   * 返回值：BusinessException
   */
  static forbidden(message?: string): BusinessException {
    return new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, message, HttpStatus.FORBIDDEN)
  }

  /**
   * 快捷构造：资源不存在（10010）
   * 参数：message 自定义消息（可选）
   * 返回值：BusinessException
   */
  static notFound(message?: string): BusinessException {
    return new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, message, HttpStatus.NOT_FOUND)
  }
}
