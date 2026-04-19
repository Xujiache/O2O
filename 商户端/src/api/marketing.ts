/**
 * @file api/marketing.ts
 * @stage P6/T6.35-T6.36 (Sprint 5)
 * @desc 营销 API：店铺券 / 满减折扣 / 拼单 / 新品推荐
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, post, put, del, genIdemKey } from '@/utils/request'
import type { ShopCoupon, ShopPromotion, KeysetPageResult } from '@/types/biz'

/* ===== 店铺券 ===== */
export function listCoupons(params: {
  shopId: string
  status?: 0 | 1 | 2
  cursor?: string | null
  limit?: number
}): Promise<KeysetPageResult<ShopCoupon>> {
  return get('/merchant/marketing/coupons', params as unknown as Record<string, unknown>)
}

export function createCoupon(
  payload: Omit<ShopCoupon, 'id' | 'receivedQty' | 'usedQty' | 'createdAt'>
): Promise<ShopCoupon> {
  return post('/merchant/marketing/coupons', payload, { idemKey: genIdemKey() })
}

export function updateCoupon(id: string, patch: Partial<ShopCoupon>): Promise<ShopCoupon> {
  return put(`/merchant/marketing/coupons/${id}`, patch)
}

export function toggleCoupon(id: string, status: 1 | 2): Promise<{ ok: boolean }> {
  return post(`/merchant/marketing/coupons/${id}/status`, { status })
}

export function deleteCoupon(id: string): Promise<{ ok: boolean }> {
  return del(`/merchant/marketing/coupons/${id}`)
}

/* ===== 营销活动（满减/折扣/拼单/新品推荐） ===== */
export function listPromotions(params: {
  shopId: string
  promotionType?: 1 | 2 | 3 | 4
  status?: 0 | 1 | 2
  cursor?: string | null
  limit?: number
}): Promise<KeysetPageResult<ShopPromotion>> {
  return get('/merchant/marketing/promotions', params as unknown as Record<string, unknown>)
}

export function createPromotion(
  payload: Omit<ShopPromotion, 'id' | 'createdAt'>
): Promise<ShopPromotion> {
  return post('/merchant/marketing/promotions', payload, { idemKey: genIdemKey() })
}

export function updatePromotion(id: string, patch: Partial<ShopPromotion>): Promise<ShopPromotion> {
  return put(`/merchant/marketing/promotions/${id}`, patch)
}

export function togglePromotion(id: string, status: 1 | 2): Promise<{ ok: boolean }> {
  return post(`/merchant/marketing/promotions/${id}/status`, { status })
}

export function deletePromotion(id: string): Promise<{ ok: boolean }> {
  return del(`/merchant/marketing/promotions/${id}`)
}
