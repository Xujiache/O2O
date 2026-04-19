/**
 * @file api/auth.ts
 * @stage P7/T7.6~T7.9 (Sprint 1)
 * @desc 骑手登录与认证 API：账密 / 短信 / 注册 / 资质 / 保证金 / 审核状态
 *
 * 后端契约（P3/P4）：所有路径前缀 /api/v1/，request 已自动拼接
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type {
  RiderLoginResult,
  RiderQualification,
  RiderAuditStatus,
  DepositInfo,
  RiderUser
} from '@/types/biz'
import { post, get, genIdemKey } from '@/utils/request'

/** 账密登录（手机号+密码） */
export function loginByPassword(payload: {
  mobile: string
  password: string
}): Promise<RiderLoginResult> {
  return post<RiderLoginResult>('/auth/rider/login', payload, {
    idemKey: genIdemKey(),
    skipAuthRefresh: true
  })
}

/** 发送短信验证码 */
export function sendSmsCode(payload: {
  mobile: string
  /** 用途：login / register / reset / bind */
  purpose: 'login' | 'register' | 'reset' | 'bind'
}): Promise<{ ok: true }> {
  return post<{ ok: true }>('/auth/sms/send', payload, {
    idemKey: genIdemKey(),
    skipAuthRefresh: true
  })
}

/** 短信验证码登录（含自动注册） */
export function loginBySms(payload: {
  mobile: string
  smsCode: string
}): Promise<RiderLoginResult> {
  return post<RiderLoginResult>('/auth/rider/login-sms', payload, {
    idemKey: genIdemKey(),
    skipAuthRefresh: true
  })
}

/** 注册（基础信息） */
export function registerRider(payload: {
  mobile: string
  smsCode: string
  password: string
  realName: string
  inviteCode?: string
}): Promise<RiderLoginResult> {
  return post<RiderLoginResult>('/auth/rider/register', payload, {
    idemKey: genIdemKey(),
    skipAuthRefresh: true
  })
}

/** 重置密码 */
export function resetPassword(payload: {
  mobile: string
  smsCode: string
  newPassword: string
}): Promise<{ ok: true }> {
  return post<{ ok: true }>('/auth/rider/reset-password', payload, {
    idemKey: genIdemKey(),
    skipAuthRefresh: true
  })
}

/** 提交资质（4 件套） */
export function submitQualification(payload: RiderQualification): Promise<RiderAuditStatus> {
  return post<RiderAuditStatus>('/rider/qualification', payload, {
    idemKey: genIdemKey()
  })
}

/** 获取资质 */
export function getQualification(): Promise<RiderQualification | null> {
  return get<RiderQualification | null>('/rider/qualification', {})
}

/** 查询审核状态 */
export function getAuditStatus(): Promise<RiderAuditStatus> {
  return get<RiderAuditStatus>('/rider/audit-status', {})
}

/** 保证金信息 */
export function getDepositInfo(): Promise<DepositInfo> {
  return get<DepositInfo>('/rider/deposit', {})
}

/** 提交保证金支付：返回支付参数（微信 / 支付宝） */
export function payDeposit(payload: { payChannel: 'wechat' | 'alipay'; amount: string }): Promise<{
  /** 微信 JSAPI / APP 支付参数；支付宝 orderStr */
  payParams: Record<string, string> | string
  /** 平台订单号（用于回调比对） */
  payOrderNo: string
}> {
  return post<{ payParams: Record<string, string> | string; payOrderNo: string }>(
    '/rider/deposit/pay',
    payload,
    { idemKey: genIdemKey() }
  )
}

/** 当前骑手个人资料 */
export function getProfile(): Promise<RiderUser> {
  return get<RiderUser>('/rider/profile', {})
}

/** 更新昵称 / 头像 */
export function updateProfile(payload: Partial<RiderUser>): Promise<RiderUser> {
  return post<RiderUser>('/rider/profile/update', payload, { idemKey: genIdemKey() })
}

/** 退出登录（后端注销 token） */
export function logoutRider(): Promise<{ ok: true }> {
  return post<{ ok: true }>('/auth/logout', {}, { idemKey: genIdemKey(), silent: true })
}
