/**
 * 客服 API（工单 / 仲裁）
 *
 * 路径对齐后端 AdminReviewController（@Controller('admin')）：
 *   /admin/tickets, /admin/arbitrations
 *
 * @module api/business/cs
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizTicket, BizArbitration, BizId } from '@/types/business'

export const csApi = {
  /** 工单 */
  ticketList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizTicket>>('/tickets', params as Record<string, unknown>),
  ticketAssign: (id: BizId, assigneeAdminId: string) =>
    bizApi.post<void>(`/tickets/${id}/assign`, { assigneeAdminId }),
  ticketReply: (id: BizId, content: string) =>
    bizApi.post<void>(`/tickets/${id}/reply`, { content }),
  ticketClose: (id: BizId, remark?: string) =>
    bizApi.post<void>(`/tickets/${id}/close`, { remark }),

  /** 仲裁 */
  arbitrationList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizArbitration>>('/arbitrations', params as Record<string, unknown>),
  arbitrationJudge: (
    id: BizId,
    payload: {
      result: 'user' | 'merchant' | 'rider' | 'split'
      refundAmount?: string
      remark?: string
    }
  ) => bizApi.post<void>(`/arbitrations/${id}/judge`, payload, { needSign: true })
}
