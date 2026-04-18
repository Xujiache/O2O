/**
 * common 模块桶形（barrel）出口
 * 功能：聚合 filters 与 interceptors 的命名导出，供 AppModule 一处 import 全家桶
 * 参数：无
 * 返回值：无（纯 re-export 文件）
 * 用途：app.module.ts 改写为 `from './common'`，减少 5 行逐文件 import（I-16）
 */
export { AllExceptionsFilter } from './filters/all-exceptions.filter'
export { LoggingInterceptor } from './interceptors/logging.interceptor'
export { TransformInterceptor } from './interceptors/transform.interceptor'
export type { StandardResponse } from './interceptors/transform.interceptor'
