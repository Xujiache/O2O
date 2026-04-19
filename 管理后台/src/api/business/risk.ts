/**
 * 风控 API（规则 / 风险订单 / 刷单 / 记录）
 * @module api/business/risk
 */
import { bizApi } from './_request'
import type {
  BizListParams,
  BizListResp,
  BizRiskRule,
  BizRiskOrder,
  BizCheatRecord,
  BizId
} from '@/types/business'

export const riskApi = {
  ruleList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizRiskRule>>('/risk/rule/list', params as Record<string, unknown>),
  ruleSave: (data: Partial<BizRiskRule>) =>
    bizApi.post<{ id: BizId }>('/risk/rule', data, { needSign: true }),
  ruleUpdate: (id: BizId, data: Partial<BizRiskRule>) =>
    bizApi.put<void>(`/risk/rule/${id}`, data, { needSign: true }),
  ruleToggle: (id: BizId, enabled: boolean) =>
    bizApi.post<void>(`/risk/rule/${id}/toggle`, { enabled }),

  riskOrderList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizRiskOrder>>(
      '/risk/risk-order/list',
      params as Record<string, unknown>
    ),
  riskOrderReview: (orderNo: string, action: 'pass' | 'block', remark?: string) =>
    bizApi.post<void>(`/risk/risk-order/${orderNo}/review`, { action, remark }, { needSign: true }),

  cheatList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizCheatRecord>>('/risk/cheat/list', params as Record<string, unknown>),
  cheatPunish: (id: BizId, action: string, remark?: string) =>
    bizApi.post<void>(`/risk/cheat/${id}/punish`, { action, remark }, { needSign: true }),

  recordList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizCheatRecord>>('/risk/record/list', params as Record<string, unknown>)
}
