/**
 * 财务管理 API
 * @module api/business/finance
 */
import { bizApi } from './_request'
import type {
  BizListParams,
  BizListResp,
  BizSettlementRule,
  BizSettlementRecord,
  BizWithdraw,
  BizBill,
  BizInvoice,
  BizId
} from '@/types/business'

export const financeApi = {
  /** 财务概览 */
  overview: () =>
    bizApi.get<{
      income: string
      commission: string
      refund: string
      balance: string
      trend: Array<{ date: string; income: number; commission: number; refund: number }>
    }>('/finance/overview'),

  /** 分账规则 */
  settlementRuleList: () => bizApi.get<BizSettlementRule[]>('/finance/settlement-rule/list'),
  settlementRuleSave: (data: Partial<BizSettlementRule>) =>
    bizApi.post<{ id: BizId }>('/finance/settlement-rule', data, { needSign: true }),
  settlementRuleUpdate: (id: BizId, data: Partial<BizSettlementRule>) =>
    bizApi.put<void>(`/finance/settlement-rule/${id}`, data, { needSign: true }),

  /** 分账记录 */
  settlementRecordList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizSettlementRecord>>(
      '/finance/settlement-record/list',
      params as Record<string, unknown>
    ),
  settlementRecordRetry: (id: BizId) =>
    bizApi.post<void>(`/finance/settlement-record/${id}/retry`, {}, { needSign: true }),

  /** 提现审核 */
  withdrawAuditList: (params: BizListParams & { status?: number }) =>
    bizApi.get<BizListResp<BizWithdraw>>(
      '/finance/withdraw-audit/list',
      params as Record<string, unknown>
    ),
  withdrawPass: (id: BizId, remark?: string) =>
    bizApi.post<void>(`/finance/withdraw-audit/${id}/pass`, { remark }, { needSign: true }),
  withdrawReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/finance/withdraw-audit/${id}/reject`, { reason }, { needSign: true }),
  /** 批量审核（V8.30） */
  withdrawBatchAudit: (ids: BizId[], action: 'pass' | 'reject', reason?: string) =>
    bizApi.post<{ successCount: number; failedCount: number }>(
      '/finance/withdraw-audit/batch',
      { ids, action, reason },
      { needSign: true }
    ),

  /** 账单 */
  billList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizBill>>('/finance/bill/list', params as Record<string, unknown>),

  /** 发票 */
  invoiceList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizInvoice>>(
      '/finance/invoice-audit/list',
      params as Record<string, unknown>
    ),
  invoicePass: (id: BizId, remark?: string) =>
    bizApi.post<void>(`/finance/invoice-audit/${id}/pass`, { remark }, { needSign: true }),
  invoiceReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/finance/invoice-audit/${id}/reject`, { reason }, { needSign: true }),
  invoiceUploadPdf: (id: BizId, pdfUrl: string) =>
    bizApi.put<void>(`/finance/invoice-audit/${id}/pdf`, { pdfUrl }, { needSign: true }),

  /** 对账 */
  reconciliationList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizSettlementRecord>>(
      '/finance/reconciliation/list',
      params as Record<string, unknown>
    )
}
