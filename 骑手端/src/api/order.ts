/**
 * @file api/order.ts
 * @stage P7/T7.17~T7.25 (Sprint 3)
 * @desc 订单：列表 / 详情 / 取件 / 凭证 / 送达 / 异常 / 转单
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type {
  RiderOrder,
  RiderOrderListParams,
  RiderAbnormalReport,
  RiderTransferApply,
  KeysetPageResult
} from '@/types/biz'
import { get, post, genIdemKey } from '@/utils/request'

/** 订单分页列表（按 Tab） */
export function fetchOrders(params: RiderOrderListParams): Promise<KeysetPageResult<RiderOrder>> {
  return get<KeysetPageResult<RiderOrder>>('/rider/orders', params as Record<string, unknown>, {
    silent: true
  })
}

/** Tab 计数 */
export function fetchTabCounts(): Promise<Record<string, number>> {
  return get<Record<string, number>>('/rider/orders/tab-counts', {}, { silent: true })
}

/** 进行中订单（工作台聚合） */
export function fetchInProgress(): Promise<RiderOrder[]> {
  return get<RiderOrder[]>('/rider/orders/in-progress', {}, { silent: true })
}

/** 订单详情 */
export function fetchOrderDetail(orderNo: string): Promise<RiderOrder> {
  return get<RiderOrder>(`/rider/orders/${orderNo}`, {})
}

/** 取件确认 */
export function pickupOrderApi(payload: {
  orderNo: string
  pickupCode: string
}): Promise<{ ok: true }> {
  return post(`/rider/orders/${payload.orderNo}/pickup`, payload, {
    idemKey: genIdemKey()
  })
}

/** 上传取件凭证 */
export function uploadPickupProofApi(payload: {
  orderNo: string
  proofUrl: string
}): Promise<{ ok: true }> {
  return post(`/rider/orders/${payload.orderNo}/proof/pickup`, payload, {
    idemKey: genIdemKey()
  })
}

/** 送达确认 */
export function deliverOrderApi(payload: {
  orderNo: string
  proofUrl: string
}): Promise<{ ok: true }> {
  return post(`/rider/orders/${payload.orderNo}/deliver`, payload, {
    idemKey: genIdemKey()
  })
}

/** 异常上报 */
export function reportAbnormalApi(payload: RiderAbnormalReport): Promise<{ ok: true }> {
  return post('/rider/orders/abnormal', payload, { idemKey: genIdemKey() })
}

/** 转单申请 */
export function transferOrderApi(payload: RiderTransferApply): Promise<{ ok: true }> {
  return post('/rider/orders/transfer', payload, { idemKey: genIdemKey() })
}

/** 取虚拟号码（拨打用户/商家） */
export function callRelay(payload: {
  orderNo: string
  /** customer / shop */
  to: 'customer' | 'shop'
}): Promise<{ relayNumber: string; expiresAt: string }> {
  return post('/rider/call-relay', payload, { idemKey: genIdemKey() })
}
