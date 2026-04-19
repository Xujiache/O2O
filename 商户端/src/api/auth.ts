/**
 * @file api/auth.ts
 * @stage P6/T6.7 (Sprint 1)
 * @desc 商户端认证 API：账密登录、短信登录、入驻申请、审核状态
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { post, get } from '@/utils/request'
import type { MerchantLoginResult, MerchantApplyParams, MerchantAuditStatus } from '@/types/biz'

/**
 * 账密登录
 * @param params 用户名+密码
 */
export function loginByPassword(params: {
  account: string
  password: string
}): Promise<MerchantLoginResult> {
  return post('/merchant/auth/login/password', params)
}

/**
 * 短信验证码登录
 * @param params 手机号 + 验证码
 */
export function loginBySms(params: {
  mobile: string
  smsCode: string
}): Promise<MerchantLoginResult> {
  return post('/merchant/auth/login/sms', params)
}

/**
 * 发送短信验证码
 * @param params.scene 业务场景：login / register / change_password / change_mobile
 */
export function sendSmsCode(params: { mobile: string; scene: string }): Promise<{ ok: boolean }> {
  return post('/merchant/auth/sms/send', params)
}

/**
 * 退出登录
 */
export function logout(): Promise<{ ok: boolean }> {
  return post('/merchant/auth/logout', {})
}

/**
 * 重置密码
 */
export function resetPassword(params: {
  mobile: string
  smsCode: string
  newPassword: string
}): Promise<{ ok: boolean }> {
  return post('/merchant/auth/password/reset', params)
}

/**
 * 提交入驻申请
 */
export function applyMerchant(params: MerchantApplyParams): Promise<{ id: string; status: 0 }> {
  return post('/merchant/auth/apply', params)
}

/**
 * 重新提交入驻（驳回后）
 */
export function reapplyMerchant(
  applyId: string,
  params: MerchantApplyParams
): Promise<{ id: string; status: 0 }> {
  return post(`/merchant/auth/apply/${applyId}/resubmit`, params)
}

/**
 * 查询入驻审核状态
 */
export function getAuditStatus(applyId: string): Promise<MerchantAuditStatus> {
  return get(`/merchant/auth/apply/${applyId}/status`)
}

/**
 * 当前已登录商户的资料
 */
export function getMe(): Promise<MerchantLoginResult['user']> {
  return get('/merchant/auth/me')
}
