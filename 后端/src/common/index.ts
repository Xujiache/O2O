/**
 * @file common/index.ts
 * @stage P1 + P3/T3.1 增强
 * @desc common 模块桶形（barrel）出口，聚合 filters / interceptors / dto / errors / exceptions
 * @author 员工 A
 *
 * 用途：业务模块统一 `import { ... } from '@/common'`
 */

// ===== Filters =====
export { AllExceptionsFilter } from './filters/all-exceptions.filter'
export { HttpExceptionFilter } from './filters/http-exception.filter'

// ===== Interceptors =====
export { LoggingInterceptor } from './interceptors/logging.interceptor'
export { TransformInterceptor } from './interceptors/transform.interceptor'
export { TimeoutInterceptor } from './interceptors/timeout.interceptor'
export type { StandardResponse } from './interceptors/transform.interceptor'

// ===== DTO =====
export { ApiResponse, PageMeta, PageResult, makePageResult } from './dto/api-response.dto'
export { PageQueryDto } from './dto/page-query.dto'

// ===== Exceptions =====
export { BusinessException } from './exceptions/business.exception'

// ===== Error Codes =====
export { BizErrorCode, BizErrorMessage, getBizErrorMessage } from './error-codes'
export type { BizErrorCodeValue } from './error-codes'
