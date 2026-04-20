/**
 * 店铺管理 API
 *
 * 路径对齐后端 ShopAdminController（@Controller('admin/shops')）
 *
 * @module api/business/shop
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizShop, BizId } from '@/types/business'

export const shopApi = {
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizShop>>('/shops', params as Record<string, unknown>),
  detail: (id: BizId) => bizApi.get<BizShop>(`/shops/${id}`),
  /** 店铺审核 */
  audit: (id: BizId, action: 'pass' | 'reject', remark?: string) =>
    bizApi.post<void>(`/shops/${id}/audit`, { action, remark }),
  /** 店铺封禁 */
  ban: (id: BizId, reason: string) => bizApi.post<void>(`/shops/${id}/ban`, { reason }),
  /** 店铺解封 */
  unban: (id: BizId) => bizApi.post<void>(`/shops/${id}/unban`),
  /** 更新配送范围（P9 待后端补接口） */
  updateDeliveryRange: (id: BizId, polygon: Array<{ lng: number; lat: number }>) =>
    bizApi.put<void>(`/shops/${id}/delivery-range`, { polygon }, { needSign: true }),
  /** 公告审核列表（P9 待后端补接口） */
  noticeAuditList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizShop>>('/shop/notice-audit/list', params as Record<string, unknown>),
  noticePass: (id: BizId) => bizApi.post<void>(`/shop/notice-audit/${id}/pass`),
  noticeReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/shop/notice-audit/${id}/reject`, { reason })
}
