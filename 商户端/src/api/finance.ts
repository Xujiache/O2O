/**
 * @file api/finance.ts
 * @stage P6/T6.29-T6.32 (Sprint 4)
 * @desc 财务 API：概览 / 账单明细 / 导出 CSV
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, post } from '@/utils/request'
import type { FinanceOverview, BillItem, KeysetPageResult } from '@/types/biz'

/** 财务概览 */
export function getOverview(shopId?: string): Promise<FinanceOverview> {
  const url = shopId ? `/merchant/finance/overview?shopId=${shopId}` : '/merchant/finance/overview'
  return get(url)
}

/** 账单明细 */
export interface BillListParams {
  shopId?: string
  bizType?: 1 | 2 | 3 | 4 | 5
  flowDirection?: 1 | 2
  startDate?: string
  endDate?: string
  cursor?: string | null
  limit?: number
}

export function listBills(params: BillListParams): Promise<KeysetPageResult<BillItem>> {
  return get('/merchant/finance/bills', params as unknown as Record<string, unknown>)
}

/** 导出账单 CSV（返回下载 URL） */
export function exportBills(params: Omit<BillListParams, 'cursor' | 'limit'>): Promise<{
  downloadUrl: string
  expiresAt: string
}> {
  return post('/merchant/finance/bills/export', params)
}
