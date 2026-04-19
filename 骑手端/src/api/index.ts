/**
 * @file api/index.ts
 * @stage P7/T7.2 (Sprint 1)
 * @desc API 模块聚合再导出
 *
 * 12 个业务模块 + 1 mock + 1 file：
 *   auth / common / file / dispatch / order / work
 *   wallet / attendance / stat / msg / setting / _mock
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
export * as auth from './auth'
export * as common from './common'
export * as file from './file'
export * as dispatch from './dispatch'
export * as order from './order'
export * as work from './work'
export * as wallet from './wallet'
export * as attendance from './attendance'
export * as stat from './stat'
export * as msg from './msg'
export * as setting from './setting'
export { mockResolve } from './_mock'
