/**
 * 店铺管理 API
 *
 * 路径对齐后端 ShopAdminController（@Controller('admin/shops')）
 *
 * @module api/business/shop
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizShop, BizId } from '@/types/business'

type DeliveryPoint = { lng: number; lat: number }

function toGeoJsonPolygon(points: DeliveryPoint[]) {
  const ring = points.map(({ lng, lat }) => [lng, lat] as [number, number])
  if (ring.length > 0) {
    const first = ring[0]!
    const last = ring[ring.length - 1]!
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]])
    }
  }
  return { type: 'Polygon' as const, coordinates: [ring] }
}

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
  /** 更新配送范围 */
  updateDeliveryRange: (
    id: BizId,
    params: { cityCode: string; name?: string; polygon: DeliveryPoint[] }
  ) =>
    bizApi.put<void>(
      `/shops/${id}/delivery-range`,
      {
        cityCode: params.cityCode,
        name: params.name,
        polygon: toGeoJsonPolygon(params.polygon)
      },
      { needSign: true }
    ),
  /** 公告审核列表（后端尚未提供独立 notice 审核接口） */
  noticeAuditList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizShop>>('/shop/notice-audit/list', params as Record<string, unknown>),
  noticePass: (id: BizId) => bizApi.post<void>(`/shop/notice-audit/${id}/pass`),
  noticeReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/shop/notice-audit/${id}/reject`, { reason })
}
