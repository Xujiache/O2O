/**
 * @file api/order.ts
 * @stage P6/T6.18-T6.24 (Sprint 3)
 * @desc 订单 API：列表（按 Tab + 子条件）/ 详情 / 接单 / 拒单 / 出餐 / 退款审核 / 异常上报 / 打印记录
 *
 * P5 经验教训：每个 Tab 必须有清晰的 status + 子条件，禁止两个 Tab 用同一过滤条件
 *   待接单 status=10 | 待出餐 status=20 | 配送中 status in [30,40] | 已完成 status in [50,55]
 *   已取消 status=60 | 售后中 status=70 | 异常 status in [10,20] AND isException=1
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, post, genIdemKey } from '@/utils/request'
import type {
  MerchantOrder,
  MerchantOrderListParams,
  KeysetPageResult,
  RefundAudit,
  OrderAbnormal
} from '@/types/biz'

/** 订单列表（按 shopId + Tab + 状态过滤；keyset 分页） */
export function listOrders(
  params: MerchantOrderListParams
): Promise<KeysetPageResult<MerchantOrder>> {
  return get('/merchant/orders', params as unknown as Record<string, unknown>)
}

/** 订单详情 */
export function getOrderDetail(orderNo: string): Promise<MerchantOrder> {
  return get(`/merchant/orders/${orderNo}`)
}

/** 接单（写操作必带幂等 key） */
export function acceptOrder(orderNo: string): Promise<{ ok: boolean; estimatedCookMin: number }> {
  return post(`/merchant/orders/${orderNo}/accept`, {}, { idemKey: genIdemKey() })
}

/** 拒单 */
export function rejectOrder(orderNo: string, reason: string): Promise<{ ok: boolean }> {
  return post(`/merchant/orders/${orderNo}/reject`, { reason }, { idemKey: genIdemKey() })
}

/** 标记出餐完成 */
export function markCooked(orderNo: string): Promise<{ ok: boolean }> {
  return post(`/merchant/orders/${orderNo}/cooked`, {}, { idemKey: genIdemKey() })
}

/** 退款列表 */
export function listRefundApplies(params: {
  shopId: string
  status?: 1 | 2 | 3
  cursor?: string | null
  limit?: number
}): Promise<KeysetPageResult<RefundAudit>> {
  return get('/merchant/refunds', params as unknown as Record<string, unknown>)
}

/** 退款审核：同意 */
export function approveRefund(
  refundId: string,
  payload: { merchantReply?: string }
): Promise<{ ok: boolean }> {
  return post(`/merchant/refunds/${refundId}/approve`, payload, { idemKey: genIdemKey() })
}

/** 退款审核：拒绝 */
export function rejectRefund(
  refundId: string,
  payload: { merchantReply: string }
): Promise<{ ok: boolean }> {
  return post(`/merchant/refunds/${refundId}/reject`, payload, { idemKey: genIdemKey() })
}

/** 上报订单异常 */
export function reportAbnormal(
  orderNo: string,
  payload: {
    abnormalType: 1 | 2 | 3 | 4
    remark: string
    evidenceUrls: string[]
  }
): Promise<OrderAbnormal> {
  return post(`/merchant/orders/${orderNo}/abnormal`, payload, { idemKey: genIdemKey() })
}

/** 标记已打印 */
export function markPrinted(orderNo: string): Promise<{ ok: boolean }> {
  return post(`/merchant/orders/${orderNo}/printed`, {}, { idemKey: genIdemKey() })
}

/** 各 Tab 计数 */
export function getOrderTabCounts(shopId: string): Promise<{
  pending: number
  cooking: number
  delivering: number
  finished: number
  canceled: number
  aftersale: number
  abnormal: number
}> {
  return get(`/merchant/shops/${shopId}/orders/tab-counts`)
}
