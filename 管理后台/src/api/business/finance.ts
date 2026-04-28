/**
 * 财务管理 API
 *
 * 路径对齐后端：
 *   AdminFinanceController     → /admin/settlement-rules /settlement-records /withdrawals /invoices /reconciliation-report
 *   AdminFinanceExtController  → /admin/finance/overview /finance/bill/list /settlement-records/:id/retry
 *   ReconciliationListAdminController → /admin/reconciliations
 *
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

export interface BizReconciliationRecord {
  id: BizId
  reconNo: string
  channel: string
  billDate: string
  totalOrders: number
  totalAmount: string
  totalFee: string
  channelOrders: number
  channelAmount: string
  diffCount: number
  diffAmount: string
  status: number
  billFileUrl?: string | null
  diffFileUrl?: string | null
  finishAt?: string | null
  createdAt: string
}

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

  /** 分账规则 CRUD */
  settlementRuleList: () => bizApi.get<BizSettlementRule[]>('/settlement-rules'),
  settlementRuleSave: (data: Partial<BizSettlementRule>) =>
    bizApi.post<{ id: BizId }>('/settlement-rules', data, { needSign: true }),
  settlementRuleUpdate: (id: BizId, data: Partial<BizSettlementRule>) =>
    bizApi.put<void>(`/settlement-rules/${id}`, data, { needSign: true }),
  settlementRuleDelete: (id: BizId) =>
    bizApi.del<void>(`/settlement-rules/${id}`, undefined, { needSign: true }),

  /** 分账记录 */
  settlementRecordList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizSettlementRecord>>(
      '/settlement-records',
      params as Record<string, unknown>
    ),
  /** 手动触发分账（运维补跑） */
  settlementRunOnce: (date: string) =>
    bizApi.post<{ scannedOrders: number; createdRecords: number }>(
      '/settlement/run-once',
      { date },
      { needSign: true }
    ),

  /** 提现审核 */
  withdrawAuditList: (params: BizListParams & { status?: number }) =>
    bizApi.get<BizListResp<BizWithdraw>>('/withdrawals', params as Record<string, unknown>),
  withdrawPass: (id: BizId, remark?: string) =>
    bizApi.post<void>(`/withdrawals/${id}/audit`, { action: 'pass', remark }, { needSign: true }),
  withdrawReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/withdrawals/${id}/audit`, { action: 'reject', reason }, { needSign: true }),
  /** 批量审核（后端暂无 batch 端点，逐个调用 audit 接口） */
  withdrawBatchAudit: async (ids: BizId[], action: 'pass' | 'reject', reason?: string) => {
    let successCount = 0
    let failedCount = 0
    for (const id of ids) {
      try {
        await bizApi.post<void>(`/withdrawals/${id}/audit`, { action, reason }, { needSign: true })
        successCount++
      } catch {
        failedCount++
      }
    }
    return { successCount, failedCount }
  },

  /** 账单 */
  billList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizBill>>('/finance/bill/list', params as Record<string, unknown>),

  /** 发票 */
  invoiceList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizInvoice>>('/invoices', params as Record<string, unknown>),
  invoicePass: (id: BizId, remark?: string) =>
    bizApi.post<void>(`/invoices/${id}/audit`, { action: 'pass', remark }, { needSign: true }),
  invoiceReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/invoices/${id}/audit`, { action: 'reject', reason }, { needSign: true }),
  /** 开票（上传 PDF） */
  invoiceIssue: (id: BizId, pdfUrl: string) =>
    bizApi.post<void>(`/invoices/${id}/issue`, { pdfUrl }, { needSign: true }),

  /** 对账差异报表（Excel 下载） */
  reconciliationReport: (billDate: string) =>
    bizApi.get<Blob>('/reconciliation-report', { billDate } as Record<string, unknown>),

  /** 对账记录 */
  reconciliationList: (
    params: BizListParams & { channel?: string; billDate?: string; status?: number }
  ) =>
    bizApi.get<BizListResp<BizReconciliationRecord>>(
      '/reconciliations',
      params as Record<string, unknown>
    ),
  settlementRecordRetry: (id: BizId) =>
    bizApi.post<void>(`/settlement-records/${id}/retry`, {}, { needSign: true })
}
