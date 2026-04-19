/**
 * @file api/coupon.ts
 * @stage P5/T5.19, T5.36 (Sprint 3/6)
 * @desc 优惠券 API：领取 / 我的券 / 最优券推荐 / 红包
 * @author 单 Agent V2.0
 */
import { get, post } from '@/utils/request'
import type { UserCoupon, Coupon, PageResult } from '@/types/biz'

export function listMyCoupons(params?: {
  /** 1 可用 / 2 已用 / 3 已过期 */
  status?: 1 | 2 | 3
  cursor?: string
  pageSize?: number
}): Promise<PageResult<UserCoupon>> {
  return get('/me/coupons', params as Record<string, unknown>)
}

export function listAvailableCoupons(): Promise<Coupon[]> {
  return get('/coupons/available')
}

export function receiveCoupon(couponId: string): Promise<{ ok: boolean }> {
  return post(`/coupons/${couponId}/receive`)
}

/** 最优券推荐 */
export function bestMatchCoupon(params: {
  orderType: 1 | 2
  shopId?: string
  totalAmount: string
}): Promise<{ userCouponId: string | null; couponName?: string; reduce?: string }> {
  return get('/me/coupons/best-match', params as Record<string, unknown>)
}

/** 抢红包 */
export function grabRedPacket(redPacketId: string): Promise<{ amount: string }> {
  return post('/me/red-packets/grab', { redPacketId })
}
