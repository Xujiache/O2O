/**
 * 订单管理 API
 *
 * 路径对齐后端：
 *   AdminOrderController   → /admin/orders, /admin/order/:orderNo/*
 *   AdminReviewController  → /admin/complaints, /admin/arbitrations, /admin/after-sales
 *
 * @module api/business/order
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizOrder, OrderFlowNode } from '@/types/business'

export const orderApi = {
  list: (params: BizListParams & { status?: number; bizType?: string }) =>
    bizApi.get<BizListResp<BizOrder>>('/orders', params as Record<string, unknown>),
  detail: (orderNo: string) =>
    bizApi.get<
      BizOrder & {
        flow: OrderFlowNode[]
        items: Array<{ name: string; qty: number; price: string }>
      }
    >(`/orders/${orderNo}`),
  forceCancel: (orderNo: string, reason: string) =>
    bizApi.post<void>(`/order/${orderNo}/force-cancel`, { reason }, { needSign: true }),
  /** 售后工作台（对齐 AdminReviewController /admin/after-sales） */
  cancelRefundAuditList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizOrder>>('/after-sales', params as Record<string, unknown>),
  cancelRefundPass: (id: string, refundAmount: string) =>
    bizApi.post<void>(
      `/after-sales/${id}/resolve`,
      { action: 'agree', actualAmount: refundAmount },
      { needSign: true }
    ),
  cancelRefundReject: (id: string, reason: string) =>
    bizApi.post<void>(
      `/after-sales/${id}/resolve`,
      { action: 'reject', reason },
      { needSign: true }
    ),
  /** 投诉 */
  complaintList: (params: BizListParams) =>
    bizApi.get<BizListResp<unknown>>('/complaints', params as Record<string, unknown>),
  complaintHandle: (id: number | string, action: 'process' | 'close', remark?: string) =>
    bizApi.post<void>(`/complaints/${id}/handle`, { action, remark }),
  /** 仲裁 */
  arbitrationList: (params: BizListParams) =>
    bizApi.get<BizListResp<unknown>>('/arbitrations', params as Record<string, unknown>),
  arbitrationJudge: (
    id: number | string,
    payload: {
      result: 'user' | 'merchant' | 'rider' | 'split'
      refundAmount?: string
      remark?: string
    }
  ) => bizApi.post<void>(`/arbitrations/${id}/judge`, payload, { needSign: true })
}
