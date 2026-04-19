/**
 * 商户管理 API
 * @module api/business/merchant
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizMerchant, BizId } from '@/types/business'

export const merchantApi = {
  /** 入驻审核列表 */
  auditList: (params: BizListParams & { status?: number }) =>
    bizApi.get<BizListResp<BizMerchant>>('/merchant/audit/list', params as Record<string, unknown>),
  /** 通过审核 */
  auditPass: (id: BizId, remark?: string) =>
    bizApi.post<void>(`/merchant/audit/${id}/pass`, { remark }),
  /** 驳回审核（必填原因） */
  auditReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/merchant/audit/${id}/reject`, { reason }),
  /** 商户列表 */
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizMerchant>>('/merchant/list', params as Record<string, unknown>),
  /** 商户详情 */
  detail: (id: BizId) => bizApi.get<BizMerchant & { shops: unknown[] }>(`/merchant/${id}`),
  /** 封禁商户 */
  ban: (id: BizId, reason: string) => bizApi.post<void>(`/merchant/${id}/ban`, { reason }),
  /** 解封商户 */
  unban: (id: BizId) => bizApi.post<void>(`/merchant/${id}/unban`),
  /** 风控列表 */
  riskList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizMerchant>>('/merchant/risk/list', params as Record<string, unknown>)
}
