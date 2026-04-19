/**
 * @file api/work.ts
 * @stage P7/T7.10~T7.12 (Sprint 2)
 * @desc 工作台：上下班、今日数据、紧急求助按钮快捷数据
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { post, get, genIdemKey } from '@/utils/request'

export interface WorkOnDutyParams {
  lng: number
  lat: number
  address?: string
  /** 是否检查健康证 / 保证金 / 服务城市 */
  forceCheck?: boolean
}

/** 上班 */
export function goOnDutyApi(payload: WorkOnDutyParams): Promise<{
  ok: true
  onDutySince: string
  fenceOk: boolean
}> {
  return post('/rider/work/on', payload, { idemKey: genIdemKey() })
}

/** 下班 */
export function goOffDutyApi(payload: { lng: number; lat: number }): Promise<{
  ok: true
  onlineSeconds: number
}> {
  return post('/rider/work/off', payload, { idemKey: genIdemKey() })
}

/** 今日数据 */
export function fetchTodayStat(): Promise<{
  income: string
  orderCount: number
  onTimeRate: string
  goodRate: string
  onlineSeconds: number
  inProgressCount: number
}> {
  return post('/rider/work/today', {}, { silent: true })
}

/** 当前是否在线（多端冲突恢复用） */
export function fetchWorkStatus(): Promise<{ onDuty: boolean; onDutySince?: string }> {
  return get('/rider/work/status', {})
}

/** 上传紧急求助 */
export function reportEmergency(payload: {
  channel: 1 | 2 | 3
  reason?: string
  lng: number
  lat: number
  orderNo?: string
  emergencyMobile?: string
}): Promise<{ ok: true; ackNo: string }> {
  return post('/rider/emergency/report', payload, { idemKey: genIdemKey() })
}
