/**
 * @file api/user.ts
 * @stage P6/T6.38 (Sprint 5)
 * @desc 商户端用户/账户安全 API：资料编辑、改密、绑手机
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, put, post } from '@/utils/request'
import type { MerchantUser } from '@/types/biz'

/** 获取当前用户资料 */
export function getProfile(): Promise<MerchantUser> {
  return get('/merchant/me')
}

/** 更新资料（昵称、头像） */
export function updateProfile(payload: {
  nickname?: string
  avatar?: string
}): Promise<MerchantUser> {
  return put('/merchant/me', payload)
}

/** 修改密码 */
export function changePassword(payload: {
  oldPassword: string
  newPassword: string
}): Promise<{ ok: boolean }> {
  return post('/merchant/me/password', payload)
}

/** 修改绑定手机号 */
export function changeMobile(payload: {
  newMobile: string
  smsCode: string
}): Promise<{ ok: boolean }> {
  return post('/merchant/me/mobile', payload)
}
