/**
 * @file api/review.ts
 * @stage P5/T5.20 (Sprint 3)
 * @desc 评价提交（用户端）
 * @author 单 Agent V2.0
 */
import { post } from '@/utils/request'
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
