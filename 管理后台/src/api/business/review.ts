/**
 * 评价 API
 * @module api/business/review
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizReview, BizId } from '@/types/business'

export const reviewApi = {
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizReview>>('/review/list', params as Record<string, unknown>),
  hide: (id: BizId, reason: string) =>
    bizApi.post<void>(`/review/${id}/hide`, { reason }, { needSign: true }),
  remove: (id: BizId, reason: string) =>
    bizApi.del<void>(`/review/${id}`, { reason }, { needSign: true }),
  appealList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizReview>>('/review/appeal/list', params as Record<string, unknown>),
  appealJudge: (id: BizId, payload: { result: 'pass' | 'reject'; remark?: string }) =>
    bizApi.post<void>(`/review/appeal/${id}/judge`, payload, { needSign: true })
}
