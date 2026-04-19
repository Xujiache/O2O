/**
 * 客服 API（工单 / 仲裁）
 * @module api/business/cs
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizTicket, BizArbitration, BizId } from '@/types/business'

export const csApi = {
  /** 工单 */
  ticketList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizTicket>>('/cs/ticket/list', params as Record<string, unknown>),
  ticketAssign: (id: BizId, assignee: string) =>
    bizApi.post<void>(`/cs/ticket/${id}/assign`, { assignee }),
  ticketProcess: (id: BizId, remark: string) =>
    bizApi.post<void>(`/cs/ticket/${id}/process`, { remark }),
  ticketClose: (id: BizId, remark?: string) =>
    bizApi.post<void>(`/cs/ticket/${id}/close`, { remark }),

  /** 仲裁（三方判定 + 退款录入） */
  arbitrationList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizArbitration>>(
      '/cs/arbitration/list',
      params as Record<string, unknown>
    ),
  arbitrationJudge: (
    id: BizId,
    payload: {
      result: 'user' | 'merchant' | 'rider' | 'split'
      refundAmount?: string
      remark?: string
    }
  ) => bizApi.post<void>(`/cs/arbitration/${id}/judge`, payload, { needSign: true })
}
