/**
 * @file api/auth.ts
 * @stage P5/T5.8 (Sprint 1)
 * @desc Auth API：微信小程序登录、手机号绑定、短信验证码、refresh、logout
 * @author 单 Agent V2.0
 */
import { post } from '@/utils/request'
import type { LoginResult, MobileBindParams } from '@/types/biz'

/**
 * 微信小程序登录
 * @param params { code, encryptedData, iv }（uni.login + uni.getUserProfile 后取得）
 */
export function wxMpLogin(params: {
  code: string
  encryptedData?: string
  iv?: string
  nickname?: string
  avatar?: string
}): Promise<LoginResult> {
  return post('/auth/wx-mp/login', params)
}

/**
 * 绑定手机号（首次微信登录后必填）
 */
export function bindMobile(params: MobileBindParams): Promise<{ ok: boolean }> {
  return post('/auth/mobile/bind', params)
}

/**
 * 发送短信验证码
 * @param params.scene 业务场景：bind_mobile / login / change_mobile
 */
export function sendSmsCode(params: { mobile: string; scene: string }): Promise<{ ok: boolean }> {
  return post('/auth/sms/send', params)
}

/** 退出登录 */
export function logout(): Promise<{ ok: boolean }> {
  return post('/auth/logout', {})
}
