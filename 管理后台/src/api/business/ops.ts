/**
 * 运营管理 API（优惠券 / 促销 / 推送 / 区域）
 *
 * 路径对齐后端：
 *   CouponAdminController    → /admin/coupons
 *   PromotionAdminController → /admin/promotions
 *   AdminOpsController       → /admin/ops/push* /admin/ops/region*
 *
 * @module api/business/ops
 */
import { bizApi } from './_request'
import type {
  BizListParams,
  BizListResp,
  BizCoupon,
  BizPromotion,
  BizPushTask,
  BizRegion,
  BizId
} from '@/types/business'

export const opsApi = {
  /** 优惠券 */
  couponList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizCoupon>>('/coupons', params as Record<string, unknown>),
  couponSave: (data: Partial<BizCoupon>) =>
    bizApi.post<{ id: BizId }>('/coupons', data, { needSign: true }),
  couponUpdate: (id: BizId, data: Partial<BizCoupon>) =>
    bizApi.put<void>(`/coupons/${id}`, data, { needSign: true }),
  couponBatchIssue: (
    id: BizId,
    payload: { strategy: 'all' | 'city' | 'tag'; param?: Record<string, unknown> }
  ) => bizApi.post<void>(`/coupons/${id}/issue`, payload, { needSign: true }),
  couponPause: (id: BizId) => bizApi.put<void>(`/coupons/${id}`, { status: 2 }, { needSign: true }),

  /** 促销 */
  promotionList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizPromotion>>('/promotions', params as Record<string, unknown>),
  promotionSave: (data: Partial<BizPromotion>) =>
    bizApi.post<{ id: BizId }>('/promotions', data, { needSign: true }),
  promotionUpdate: (id: BizId, data: Partial<BizPromotion>) =>
    bizApi.put<void>(`/promotions/${id}`, data, { needSign: true }),
  promotionToggle: (id: BizId, enabled: boolean) =>
    bizApi.put<void>(`/promotions/${id}/status`, { status: enabled ? 1 : 2 }),

  /** 推送任务 */
  pushList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizPushTask>>('/ops/push/list', params as Record<string, unknown>),
  pushSave: (data: Partial<BizPushTask>) =>
    bizApi.post<{ id: BizId }>('/ops/push', data, { needSign: true }),
  pushCancel: (id: BizId) => bizApi.post<void>(`/ops/push/${id}/cancel`),
  pushTemplateList: () =>
    bizApi.get<
      Array<{ id: BizId; code: string; name: string; channels: string[]; content: string }>
    >('/ops/push-template/list'),
  pushTemplateSave: (data: {
    id?: BizId
    code: string
    name: string
    channels: string[]
    content: string
  }) => bizApi.post<{ id: BizId }>('/ops/push-template', data, { needSign: true }),

  /** 区域配置 */
  regionList: () => bizApi.get<BizRegion[]>('/ops/region/list'),
  regionSave: (data: Partial<BizRegion>) =>
    bizApi.put<void>(`/ops/region/${data.cityCode}`, data, { needSign: true }),
  regionToggle: (cityCode: string, enabled: boolean) =>
    bizApi.post<void>(`/ops/region/${cityCode}/toggle`, { enabled })
}
