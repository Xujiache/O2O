/**
 * 评价 API
 *
 * 路径对齐后端 AdminReviewController（@Controller('admin')）：
 *   /admin/reviews, /admin/review-appeals
 *
 * @module api/business/review
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizReview, BizId } from '@/types/business'

export const reviewApi = {
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizReview>>('/reviews', params as Record<string, unknown>),
  hide: (id: BizId, reason: string) =>
    bizApi.post<void>(`/reviews/${id}/hide`, { reason }, { needSign: true }),
  remove: (id: BizId, reason: string) =>
    bizApi.post<void>(`/reviews/${id}/hide`, { reason, hidden: true }, { needSign: true }),
  appealList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizReview>>('/review-appeals', params as Record<string, unknown>),
  appealJudge: (id: BizId, payload: { result: 'pass' | 'reject'; remark?: string }) =>
    bizApi.post<void>(`/review-appeals/${id}/audit`, payload, { needSign: true })
}
