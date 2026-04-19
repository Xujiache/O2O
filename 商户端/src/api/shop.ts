/**
 * @file api/shop.ts
 * @stage P6/T6.10-T6.17 (Sprint 2)
 * @desc 店铺 API：列表 / 详情 / 编辑 / 营业时间 / 配送范围 / 配送费 / 评价 / 营业状态
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, put, post } from '@/utils/request'
import type {
  Shop,
  BusinessHourDay,
  DeliveryFeeRule,
  LngLat,
  MerchantReview,
  PageResult,
  KeysetPageResult
} from '@/types/biz'

/** 我的店铺列表 */
export function listMyShops(): Promise<Shop[]> {
  return get('/merchant/shops')
}

/** 店铺详情 */
export function getShopDetail(shopId: string): Promise<Shop> {
  return get(`/merchant/shops/${shopId}`)
}

/** 编辑店铺基础信息 */
export function updateShop(
  shopId: string,
  patch: Partial<
    Pick<
      Shop,
      | 'name'
      | 'intro'
      | 'logo'
      | 'cover'
      | 'images'
      | 'announcement'
      | 'category'
      | 'contactPhone'
      | 'address'
      | 'lng'
      | 'lat'
      | 'cityCode'
      | 'prepareMin'
      | 'minAmount'
      | 'supportPreOrder'
      | 'supportInvoice'
    >
  >
): Promise<Shop> {
  return put(`/merchant/shops/${shopId}`, patch)
}

/** 切换营业状态：0 歇业 / 1 营业 / 2 临时歇业 */
export function toggleShopOpen(
  shopId: string,
  payload: { isOpen: 0 | 1 | 2; tempCloseReason?: string; tempCloseUntil?: string }
): Promise<{ ok: boolean }> {
  return post(`/merchant/shops/${shopId}/status`, payload)
}

/** 切换自动接单 */
export function toggleAutoAccept(shopId: string, autoAccept: 0 | 1): Promise<{ ok: boolean }> {
  return post(`/merchant/shops/${shopId}/auto-accept`, { autoAccept })
}

/** 获取营业时间（7 天） */
export function getBusinessHours(shopId: string): Promise<BusinessHourDay[]> {
  return get(`/merchant/shops/${shopId}/business-hours`)
}

/** 设置营业时间 */
export function setBusinessHours(
  shopId: string,
  hours: BusinessHourDay[]
): Promise<{ ok: boolean }> {
  return put(`/merchant/shops/${shopId}/business-hours`, { hours })
}

/** 获取配送范围 polygon */
export function getDeliveryArea(shopId: string): Promise<LngLat[]> {
  return get(`/merchant/shops/${shopId}/delivery-area`)
}

/** 设置配送范围 polygon */
export function setDeliveryArea(shopId: string, polygon: LngLat[]): Promise<{ ok: boolean }> {
  return put(`/merchant/shops/${shopId}/delivery-area`, { polygon })
}

/** 获取阶梯配送费规则 */
export function getDeliveryFeeRules(shopId: string): Promise<DeliveryFeeRule[]> {
  return get(`/merchant/shops/${shopId}/delivery-fee`)
}

/** 设置阶梯配送费规则 */
export function setDeliveryFeeRules(
  shopId: string,
  rules: DeliveryFeeRule[]
): Promise<{ ok: boolean }> {
  return put(`/merchant/shops/${shopId}/delivery-fee`, { rules })
}

/** 评价列表 */
export interface ReviewListParams {
  shopId: string
  /** 评分筛选 */
  ratingMin?: 1 | 2 | 3 | 4 | 5
  ratingMax?: 1 | 2 | 3 | 4 | 5
  /** 是否未回复 */
  unreplied?: 0 | 1
  cursor?: string | null
  limit?: number
}

export function listReviews(params: ReviewListParams): Promise<KeysetPageResult<MerchantReview>> {
  return get('/merchant/reviews', params as unknown as Record<string, unknown>)
}

/** 回复评价 */
export function replyReview(reviewId: string, reply: string): Promise<{ ok: boolean }> {
  return post(`/merchant/reviews/${reviewId}/reply`, { reply })
}

/** 申诉评价 */
export function appealReview(
  reviewId: string,
  payload: { reason: string; evidenceUrls: string[] }
): Promise<{ ok: boolean }> {
  return post(`/merchant/reviews/${reviewId}/appeal`, payload)
}

/** 评价统计 */
export function getReviewStat(shopId: string): Promise<{
  total: number
  scoreAvg: string
  goodCount: number
  midCount: number
  badCount: number
  unrepliedCount: number
  tags: { name: string; count: number }[]
}> {
  return get(`/merchant/shops/${shopId}/reviews/stat`)
}

/** 工作台 KPI 卡 */
export function getWorkbenchKpi(shopId: string): Promise<{
  todayOrderCount: number
  todayIncome: string
  pendingOrderCount: number
  scoreAvg: string
  monthOrderCount: number
  monthIncome: string
  abnormalCount: number
}> {
  return get(`/merchant/shops/${shopId}/workbench/kpi`)
}

/** 工作台评分曲线（最近 30 天） */
export function getRatingTrend(
  shopId: string,
  days = 30
): Promise<{ date: string; score: number }[]> {
  return get(`/merchant/shops/${shopId}/workbench/rating-trend`, { days })
}

/** 占位：分页响应（外部使用） */
export type ReviewListResult = PageResult<MerchantReview>
