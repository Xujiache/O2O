/**
 * @file api/dispatch.ts
 * @stage P7/T7.13~T7.16 (Sprint 2)
 * @desc 派单：接单大厅 / 抢单 / 系统派单接单/拒单/超时 / 接单偏好
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type { DispatchOrder, AcceptPreference } from '@/types/biz'
import { get, post, genIdemKey } from '@/utils/request'

/** 接单大厅列表（抢单池） */
export function fetchDispatchHall(query?: {
  bizType?: 1 | 2 | 3
  /** 排序：distance / fee / route */
  sortBy?: 'distance' | 'fee' | 'route'
  radius?: number
}): Promise<DispatchOrder[]> {
  return get<DispatchOrder[]>('/rider/dispatch/hall', query as Record<string, unknown>, {
    silent: true
  })
}

/** 派单详情（接单前预览） */
export function fetchDispatchDetail(orderNo: string): Promise<DispatchOrder> {
  return get<DispatchOrder>(`/rider/dispatch/${orderNo}`, {})
}

/** 系统派单：接单 */
export function acceptDispatchApi(orderNo: string): Promise<{ ok: true }> {
  return post(`/rider/dispatch/${orderNo}/accept`, {}, { idemKey: genIdemKey() })
}

/** 系统派单：拒单 */
export function rejectDispatchApi(orderNo: string, reason?: string): Promise<{ ok: true }> {
  return post(
    `/rider/dispatch/${orderNo}/reject`,
    { reason: reason ?? '' },
    { idemKey: genIdemKey(), silent: true }
  )
}

/** 系统派单：超时（前端倒计时归零兜底） */
export function timeoutDispatchApi(orderNo: string): Promise<{ ok: true }> {
  return post(`/rider/dispatch/${orderNo}/timeout`, {}, { idemKey: genIdemKey(), silent: true })
}

/** 抢单（原子） */
export function grabOrderApi(orderNo: string): Promise<{ ok: true }> {
  return post(`/rider/dispatch/${orderNo}/grab`, {}, { idemKey: genIdemKey(), retry: 0 })
}

/** 接单偏好（mode / bizType / radius） */
export function fetchPreference(): Promise<AcceptPreference> {
  return get<AcceptPreference>('/rider/preference', {}, { silent: true })
}

/** 更新接单偏好 */
export function updatePreference(payload: Partial<AcceptPreference>): Promise<AcceptPreference> {
  return post<AcceptPreference>('/rider/preference', payload, { idemKey: genIdemKey() })
}
