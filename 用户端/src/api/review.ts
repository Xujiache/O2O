/**
 * @file api/review.ts
 * @stage P5/T5.20 (Sprint 3) + P9 Sprint 6 / W6.E.2
 * @desc 评价提交（用户端） + 评价标签字典（GET /me/reviews/tags）
 * @author 单 Agent V2.0
 */
import { get, post } from '@/utils/request'
import type { Review } from '@/types/biz'

export function submitReview(payload: {
  orderNo: string
  shopRating: 1 | 2 | 3 | 4 | 5
  productRating: 1 | 2 | 3 | 4 | 5
  deliveryRating: 1 | 2 | 3 | 4 | 5
  content: string
  images?: string[]
  tags?: string[]
}): Promise<Review> {
  return post('/me/reviews', payload)
}

/**
 * 评价标签字典（GET /me/reviews/tags）
 * 后端返回：用户历史评价 tags Top N + 默认兜底（共 8 个）
 * 失败时调用方应回退默认 tags
 */
export function getReviewTags(): Promise<string[]> {
  return get('/me/reviews/tags')
}
