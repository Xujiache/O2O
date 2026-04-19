/**
 * 运营管理 API（优惠券 / 促销 / 推送 / 区域）
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
    bizApi.get<BizListResp<BizCoupon>>('/ops/coupon/list', params as Record<string, unknown>),
  couponSave: (data: Partial<BizCoupon>) =>
    bizApi.post<{ id: BizId }>('/ops/coupon', data, { needSign: true }),
  couponUpdate: (id: BizId, data: Partial<BizCoupon>) =>
    bizApi.put<void>(`/ops/coupon/${id}`, data, { needSign: true }),
  couponBatchIssue: (
    id: BizId,
    payload: { strategy: 'all' | 'city' | 'tag'; param?: Record<string, unknown> }
  ) => bizApi.post<void>(`/ops/coupon/${id}/batch-issue`, payload, { needSign: true }),
  couponPause: (id: BizId) => bizApi.post<void>(`/ops/coupon/${id}/pause`),

  /** 促销 */
  promotionList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizPromotion>>('/ops/promotion/list', params as Record<string, unknown>),
  promotionSave: (data: Partial<BizPromotion>) =>
    bizApi.post<{ id: BizId }>('/ops/promotion', data, { needSign: true }),
  promotionUpdate: (id: BizId, data: Partial<BizPromotion>) =>
    bizApi.put<void>(`/ops/promotion/${id}`, data, { needSign: true }),
  promotionToggle: (id: BizId, enabled: boolean) =>
    bizApi.post<void>(`/ops/promotion/${id}/toggle`, { enabled }),

  /** 推送 */
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

  /** 区域 */
  regionList: () => bizApi.get<BizRegion[]>('/ops/region/list'),
  regionSave: (data: Partial<BizRegion>) =>
    bizApi.put<void>(`/ops/region/${data.cityCode}`, data, { needSign: true }),
  regionToggle: (cityCode: string, enabled: boolean) =>
    bizApi.post<void>(`/ops/region/${cityCode}/toggle`, { enabled })
}
