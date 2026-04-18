/**
 * @file api-response.dto.ts
 * @stage P3/T3.1
 * @desc 全平台统一响应体 DTO（含 Swagger schema 描述）+ 工厂方法
 * @author 员工 A
 *
 * 响应结构对齐 DESIGN_P3 §7.1：
 * { code, message, data, traceId, timestamp }
 * - code:      0 = 成功；其余值见 BizErrorCode
 * - message:   人类可读消息（中文）
 * - data:      业务数据（成功时为对象 / 列表；失败时为 null）
 * - traceId:   请求链路 ID（由 LoggingInterceptor / x-trace-id 注入）
 * - timestamp: 服务端响应毫秒时间戳
 */

import { ApiProperty } from '@nestjs/swagger'
import { BizErrorCode, getBizErrorMessage } from '../error-codes'

/**
 * 标准响应体（泛型 T = 业务数据类型）
 * 用途：Controller 直接返回业务数据，由 TransformInterceptor 自动包裹；
 *      亦可在异常路径手动构造 ApiResponse.fail(...) 直出
 */
export class ApiResponse<T = unknown> {
  @ApiProperty({ description: '业务码：0=成功；其余见错误码表', example: 0 })
  code!: number

  @ApiProperty({ description: '人类可读消息', example: 'ok' })
  message!: string

  @ApiProperty({ description: '业务数据（失败时为 null）', nullable: true })
  data!: T | null

  @ApiProperty({ description: '链路追踪 ID', example: '6f3a9b2e8c14' })
  traceId!: string

  @ApiProperty({ description: '服务端响应时间戳（ms）', example: 1745040000000 })
  timestamp!: number

  /**
   * 构造成功响应
   * 参数：data 业务数据；traceId 链路 ID；message 可选自定义消息
   * 返回值：ApiResponse 实例
   */
  static ok<T>(data: T, traceId = '', message = 'ok'): ApiResponse<T> {
    return {
      code: BizErrorCode.OK,
      message,
      data,
      traceId,
      timestamp: Date.now()
    }
  }

  /**
   * 构造失败响应
   * 参数：bizCode 业务错误码；message 可选自定义消息；traceId 链路 ID
   * 返回值：ApiResponse<null> 实例
   */
  static fail(bizCode: number, message?: string, traceId = ''): ApiResponse<null> {
    return {
      code: bizCode,
      message: message ?? getBizErrorMessage(bizCode),
      data: null,
      traceId,
      timestamp: Date.now()
    }
  }
}

/**
 * 分页元信息
 * 用途：列表接口返回 PageResult<T> 时承载分页参数
 */
export class PageMeta {
  @ApiProperty({ description: '当前页码（从 1 开始）', example: 1 })
  page!: number

  @ApiProperty({ description: '每页条数', example: 20 })
  pageSize!: number

  @ApiProperty({ description: '总记录数', example: 123 })
  total!: number

  @ApiProperty({ description: '总页数', example: 7 })
  totalPages!: number
}

/**
 * 分页结果（业务模块统一返回结构）
 * 用途：service 层 list 方法返回，Controller 包一层 ApiResponse 即可
 */
export class PageResult<T> {
  @ApiProperty({ description: '本页数据列表', isArray: true })
  list!: T[]

  @ApiProperty({ description: '分页元信息', type: PageMeta })
  meta!: PageMeta
}

/**
 * 构造分页结果
 * 参数：list 当前页数据；total 总数；page 当前页；pageSize 每页条数
 * 返回值：PageResult<T>
 * 用途：service 层 return makePageResult(rows, total, page, pageSize)
 */
export function makePageResult<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number
): PageResult<T> {
  return {
    list,
    meta: {
      page,
      pageSize,
      total,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0
    }
  }
}
