/**
 * 店铺管理 API
 * @module api/business/shop
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizShop, BizId } from '@/types/business'

export const shopApi = {
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizShop>>('/shop/list', params as Record<string, unknown>),
  detail: (id: BizId) => bizApi.get<BizShop>(`/shop/${id}`),
  /** 更新配送范围（polygon） */
  updateDeliveryRange: (id: BizId, polygon: Array<{ lng: number; lat: number }>) =>
    bizApi.put<void>(`/shop/${id}/delivery-range`, { polygon }, { needSign: true }),
  /** 公告审核列表 */
  noticeAuditList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizShop>>('/shop/notice-audit/list', params as Record<string, unknown>),
  /** 公告通过 */
  noticePass: (id: BizId) => bizApi.post<void>(`/shop/notice-audit/${id}/pass`),
  /** 公告驳回 */
  noticeReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/shop/notice-audit/${id}/reject`, { reason })
}
