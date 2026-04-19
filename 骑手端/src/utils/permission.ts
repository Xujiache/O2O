/**
 * @file permission.ts
 * @stage P7/T7.1 (Sprint 1)
 * @desc 骑手端门禁工具：资质审核 / 保证金 / 健康证 / 在线状态
 *   不像商户端那样存在子账号 RBAC（一个骑手 = 一个账号），
 *   而是基于 riderProfile 上的若干字段做即时判断。
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import dayjs from 'dayjs'

/** 骑手账号状态 */
export type RiderAccountStatus =
  | 'pending' // 待审核
  | 'approved' // 已通过
  | 'rejected' // 驳回
  | 'frozen' // 冻结
  | 'expired' // 健康证过期

/** 骑手关键档案（auth store 同步） */
export interface RiderProfile {
  riderId: string
  status: RiderAccountStatus
  /** 健康证有效期 ISO 字符串 */
  healthCertExpireAt?: string | null
  /** 保证金已支付 */
  depositPaid: boolean
  /** 上岗状态 */
  onDuty: boolean
  /** 服务城市编码（防止跨城接单，CONSENSUS §四） */
  serviceCityCode?: string | null
}

/**
 * 是否可以进行核心业务（接单/抢单/打卡/提现）
 * 通过条件：approved + 保证金已交 + 健康证未过期
 */
export function canWork(p: RiderProfile | null | undefined): boolean {
  if (!p) return false
  if (p.status !== 'approved') return false
  if (!p.depositPaid) return false
  if (!isHealthCertValid(p.healthCertExpireAt)) return false
  return true
}

/**
 * 健康证是否仍在有效期内
 * @param expireAt ISO 字符串
 */
export function isHealthCertValid(expireAt: string | null | undefined): boolean {
  if (!expireAt) return false
  return dayjs(expireAt).isAfter(dayjs())
}

/**
 * 健康证是否进入提醒窗口（到期前 15 天内）
 * 用于工作台 / 通知中心提示
 */
export function isHealthCertExpiringSoon(expireAt: string | null | undefined): boolean {
  if (!expireAt) return true
  const days = dayjs(expireAt).diff(dayjs(), 'day')
  return days >= 0 && days <= 15
}

/**
 * 校验当前位置是否在服务城市内
 * @param riderCity 骑手注册城市
 * @param locationCity 当前定位城市
 */
export function isInServiceCity(
  riderCity: string | null | undefined,
  locationCity: string | null | undefined
): boolean {
  if (!riderCity || !locationCity) return true
  return riderCity === locationCity
}

/**
 * 文案化的不可工作原因（用于工作台拦截 toast）
 */
export function getBlockReason(p: RiderProfile | null | undefined): string | null {
  if (!p) return '请先登录'
  if (p.status === 'pending') return '资质审核中，暂不可接单'
  if (p.status === 'rejected') return '资质未通过，请重新提交'
  if (p.status === 'frozen') return '账号已冻结，请联系客服'
  if (p.status === 'expired') return '健康证已过期，请重新上传'
  if (!p.depositPaid) return '请先缴纳保证金'
  if (!isHealthCertValid(p.healthCertExpireAt)) return '健康证已过期，请尽快更新'
  return null
}
