/**
 * 订单管理 API
 * @module api/business/order
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizOrder, OrderFlowNode } from '@/types/business'

export const orderApi = {
  list: (params: BizListParams & { status?: number; bizType?: string }) =>
    bizApi.get<BizListResp<BizOrder>>('/order/list', params as Record<string, unknown>),
  detail: (orderNo: string) =>
    bizApi.get<
      BizOrder & {
        flow: OrderFlowNode[]
        items: Array<{ name: string; qty: number; price: string }>
      }
    >(`/order/${orderNo}`),
  forceCancel: (orderNo: string, reason: string) =>
    bizApi.post<void>(`/order/${orderNo}/force-cancel`, { reason }, { needSign: true }),
  /** 取消/退款审核 */
  cancelRefundAuditList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizOrder>>(
      '/order/cancel-refund-audit/list',
      params as Record<string, unknown>
    ),
  cancelRefundPass: (orderNo: string, refundAmount: string) =>
    bizApi.post<void>(
      `/order/cancel-refund-audit/${orderNo}/pass`,
      { refundAmount },
      { needSign: true }
    ),
  cancelRefundReject: (orderNo: string, reason: string) =>
    bizApi.post<void>(
      `/order/cancel-refund-audit/${orderNo}/reject`,
      { reason },
      { needSign: true }
    ),
  /** 投诉 */
  complaintList: (params: BizListParams) =>
    bizApi.get<BizListResp<unknown>>('/order/complaint/list', params as Record<string, unknown>),
  complaintHandle: (id: number | string, action: 'process' | 'close', remark?: string) =>
    bizApi.post<void>(`/order/complaint/${id}/${action}`, { remark }),
  /** 仲裁 */
  arbitrationList: (params: BizListParams) =>
    bizApi.get<BizListResp<unknown>>('/order/arbitration/list', params as Record<string, unknown>),
  arbitrationJudge: (
    id: number | string,
    payload: {
      result: 'user' | 'merchant' | 'rider' | 'split'
      refundAmount?: string
      remark?: string
    }
  ) => bizApi.post<void>(`/order/arbitration/${id}/judge`, payload, { needSign: true })
}
