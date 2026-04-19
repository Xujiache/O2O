/**
 * @file api/setting.ts
 * @stage P7/T7.43~T7.44 (Sprint 6)
 * @desc 设置：通知 / 安全 / 帮助 / 反馈 / 关于 / 紧急联系人
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type { NotifySettings } from '@/types/biz'
import { get, post, genIdemKey } from '@/utils/request'

export function fetchNotifySetting(): Promise<NotifySettings> {
  return get<NotifySettings>('/rider/settings/notify', {}, { silent: true })
}

export function updateNotifySetting(payload: Partial<NotifySettings>): Promise<NotifySettings> {
  return post<NotifySettings>('/rider/settings/notify', payload, { idemKey: genIdemKey() })
}

/** 修改密码 */
export function changePassword(payload: {
  oldPassword: string
  newPassword: string
}): Promise<{ ok: true }> {
  return post('/rider/settings/password', payload, { idemKey: genIdemKey() })
}

/** 反馈 */
export function submitFeedback(payload: {
  category: 'app' | 'order' | 'pay' | 'other'
  content: string
  contact?: string
  imageUrls?: string[]
}): Promise<{ ok: true }> {
  return post('/rider/settings/feedback', payload, { idemKey: genIdemKey() })
}

export interface HelpItem {
  id: string
  question: string
  answer: string
  category: string
}

/** 帮助中心 FAQ */
export function fetchHelpItems(category?: string): Promise<HelpItem[]> {
  return get('/rider/settings/help', { category }, { silent: true })
}

export interface AppMeta {
  version: string
  /** ICP / 营业执照 / 隐私政策 等 */
  privacyPolicyUrl: string
  userAgreementUrl: string
  riderAgreementUrl: string
  contactPhone: string
  email: string
}

export function fetchAppMeta(): Promise<AppMeta> {
  return get<AppMeta>('/rider/settings/about', {}, { silent: true })
}

/** 紧急联系人 */
export function updateEmergencyContact(payload: {
  contactName: string
  contactMobile: string
}): Promise<{ ok: true }> {
  return post('/rider/settings/emergency-contact', payload, { idemKey: genIdemKey() })
}
