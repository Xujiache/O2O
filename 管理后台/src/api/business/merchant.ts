/**
 * 商户管理 API
 *
 * 路径对齐后端 AdminController（@Controller('admin')）：/admin/merchants
 *
 * @module api/business/merchant
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizMerchant, BizId } from '@/types/business'

const ROOT_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || '/'

export const merchantApi = {
  /** 商户列表（含审核状态筛选） */
  auditList: (params: BizListParams & { status?: number }) =>
    bizApi.get<BizListResp<BizMerchant>>('/merchants', params as Record<string, unknown>),
  /** 通过审核 */
  auditPass: (id: BizId, remark?: string) =>
    bizApi.post<void>(`/merchants/${id}/audit`, { action: 'pass', remark }),
  /** 驳回审核（必填原因） */
  auditReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/merchants/${id}/audit`, { action: 'reject', reason }),
  /** 商户列表 */
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizMerchant>>('/merchants', params as Record<string, unknown>),
  /** 商户详情（真实根路由 /merchants/:id） */
  detail: (id: BizId) =>
    bizApi.get<BizMerchant & { shops: unknown[] }>(`/merchants/${id}`, undefined, {
      baseURL: ROOT_BASE_URL
    }),
  /** 封禁商户（status=0） */
  ban: (id: BizId) => bizApi.put<void>(`/merchants/${id}/status/0`, {}),
  /** 解封商户（status=1） */
  unban: (id: BizId) => bizApi.put<void>(`/merchants/${id}/status/1`, {}),
  /** 风控列表（复用 merchants 列表带状态筛选） */
  riskList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizMerchant>>('/merchants', {
      ...params,
      status: 0
    } as Record<string, unknown>)
}
