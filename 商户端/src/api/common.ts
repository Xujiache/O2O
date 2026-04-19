/**
 * @file api/common.ts
 * @stage P6/T6.2 (Sprint 1)
 * @desc 通用 API：健康检查 / 字典 / 经营类目 / 银行列表
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, rootGet } from '@/utils/request'

/** 健康检查（开发联调用） */
export function fetchHealth(): Promise<{ status: string; info?: unknown; error?: unknown }> {
  return rootGet('/health')
}

/** 字典：经营类目 */
export function getMerchantCategories(): Promise<{ code: string; name: string }[]> {
  return get('/merchant/dict/categories')
}

/** 字典：银行列表 */
export function getBanks(): Promise<{ code: string; name: string; logo: string }[]> {
  return get('/merchant/dict/banks')
}

/** 字典：异常类型 */
export function getAbnormalTypes(): Promise<{ code: number; name: string }[]> {
  return get('/merchant/dict/abnormal-types')
}

/** 字典：拒单理由 */
export function getRejectReasons(): Promise<{ code: number; name: string }[]> {
  return get('/merchant/dict/reject-reasons')
}
