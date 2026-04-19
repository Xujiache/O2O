/**
 * @file api/user.ts
 * @stage P5/T5.8 (Sprint 1)
 * @desc 用户中心 API：资料 / 实名 / 地址 / 收藏 / 邀请 / 积分 / 设置
 * @author 单 Agent V2.0
 */
import { get, post, put, del } from '@/utils/request'
import type {
  UserInfo,
  UserAddress,
  AddressParsed,
  FavoriteShop,
  FavoriteProduct,
  PageResult
} from '@/types/biz'

/* ========== 个人资料 ========== */
export function getProfile(): Promise<UserInfo> {
  return get('/me')
}

export function updateProfile(payload: Partial<UserInfo>): Promise<UserInfo> {
  return put('/me', payload)
}

/* ========== 实名认证 ========== */
export function submitRealname(payload: {
  realname: string
  idCard: string
  frontImageId?: string
  backImageId?: string
}): Promise<{ status: number; remark?: string }> {
  return post('/me/realname', payload)
}

export function getRealnameStatus(): Promise<{ status: number; remark?: string }> {
  return get('/me/realname')
}

/* ========== 地址 ========== */
export function listAddresses(): Promise<UserAddress[]> {
  return get('/me/addresses')
}

export function getAddress(id: string): Promise<UserAddress> {
  return get(`/me/addresses/${id}`)
}

export function createAddress(
  payload: Omit<UserAddress, 'id' | 'createdAt'>
): Promise<UserAddress> {
  return post('/me/addresses', payload)
}

export function updateAddress(
  id: string,
  payload: Partial<Omit<UserAddress, 'id' | 'createdAt'>>
): Promise<UserAddress> {
  return put(`/me/addresses/${id}`, payload)
}

export function deleteAddress(id: string): Promise<{ ok: boolean }> {
  return del(`/me/addresses/${id}`)
}

export function setDefaultAddress(id: string): Promise<{ ok: boolean }> {
  return post(`/me/addresses/${id}/default`)
}

/** 地址智能识别（粘贴文字解析） */
export function parseAddressText(text: string): Promise<AddressParsed> {
  return post('/me/addresses/parse', { text })
}

/* ========== 收藏 ========== */
export function listFavoriteShops(params?: {
  cursor?: string
  pageSize?: number
}): Promise<PageResult<FavoriteShop>> {
  return get('/me/favorites/shops', params as Record<string, unknown>)
}

export function listFavoriteProducts(params?: {
  cursor?: string
  pageSize?: number
}): Promise<PageResult<FavoriteProduct>> {
  return get('/me/favorites/products', params as Record<string, unknown>)
}

export function favoriteShop(shopId: string): Promise<{ ok: boolean }> {
  return post(`/me/shops/${shopId}/favorite`)
}

export function unfavoriteShop(shopId: string): Promise<{ ok: boolean }> {
  return del(`/me/shops/${shopId}/favorite`)
}

export function favoriteProduct(productId: string): Promise<{ ok: boolean }> {
  return post(`/me/products/${productId}/favorite`)
}

export function unfavoriteProduct(productId: string): Promise<{ ok: boolean }> {
  return del(`/me/products/${productId}/favorite`)
}

/* ========== 邀请 ========== */
export function getInviteInfo(): Promise<{
  inviteCode: string
  inviteUrl: string
  totalInvited: number
  totalReward: string
  recentList: Array<{ nickname: string; avatar: string; rewardAmount: string; createdAt: string }>
}> {
  return get('/me/invite')
}

export function bindInviter(inviteCode: string): Promise<{ ok: boolean }> {
  return post('/me/invite/bind', { inviteCode })
}

/* ========== 积分 ========== */
export function getPoints(): Promise<{
  available: number
  expiring: number
  totalEarned: number
  totalSpent: number
}> {
  return get('/me/points')
}

export function getPointFlows(params?: { cursor?: string; pageSize?: number }): Promise<
  PageResult<{
    id: string
    amount: number
    bizType: number
    remark: string
    createdAt: string
  }>
> {
  return get('/me/points/flows', params as Record<string, unknown>)
}

/* ========== 设置 ========== */
export function getSettings(): Promise<{
  notifyOrder: boolean
  notifyPromotion: boolean
  notifySystem: boolean
  privacyAllowMarketing: boolean
}> {
  return get('/me/settings')
}

export function updateSettings(payload: {
  notifyOrder?: boolean
  notifyPromotion?: boolean
  notifySystem?: boolean
  privacyAllowMarketing?: boolean
}): Promise<{ ok: boolean }> {
  return put('/me/settings', payload)
}

/* ========== 反馈 ========== */
export function submitFeedback(payload: {
  category: string
  content: string
  contact?: string
  imageUrls?: string[]
}): Promise<{ ok: boolean }> {
  return post('/me/feedbacks', payload)
}
