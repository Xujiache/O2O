/**
 * @file api/index.ts
 * @stage P6/T6.2 (Sprint 1)
 * @desc 商户端 API 模块统一导出入口
 *
 * API path 前缀约定：商户端统一使用 `/merchant/*`（DESIGN §3.5）
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
export * as authApi from './auth'
export * as userApi from './user'
export * as shopApi from './shop'
export * as orderApi from './order'
export * as productApi from './product'
export * as financeApi from './finance'
export * as walletApi from './wallet'
export * as invoiceApi from './invoice'
export * as statApi from './stat'
export * as msgApi from './msg'
export * as marketingApi from './marketing'
export * as staffApi from './staff'
export * as fileApi from './file'
export * as commonApi from './common'
