/**
 * @file api/wallet.ts
 * @stage P7/T7.32~T7.35 (Sprint 5)
 * @desc 钱包：概览 / 账单 / 提现 / 银行卡 / 薪资规则 / 导出
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type {
  WalletOverview,
  BillItem,
  BankCard,
  WithdrawApply,
  SalaryRule,
  KeysetPageResult
} from '@/types/biz'
import { get, post, genIdemKey } from '@/utils/request'

export function fetchOverview(): Promise<WalletOverview> {
  return get<WalletOverview>('/rider/wallet/overview', {}, { silent: true })
}

export function fetchBills(query: {
  cursor?: string | null
  limit?: number
  startTime?: string
  endTime?: string
  bizType?: 1 | 2 | 3 | 4 | 5
}): Promise<KeysetPageResult<BillItem>> {
  return get<KeysetPageResult<BillItem>>('/rider/wallet/bills', query as Record<string, unknown>, {
    silent: true
  })
}

export function fetchBankCards(): Promise<BankCard[]> {
  return get<BankCard[]>('/rider/wallet/cards', {}, { silent: true })
}

export function addBankCard(payload: Omit<BankCard, 'id' | 'isDefault'>): Promise<{ ok: true }> {
  return post('/rider/wallet/cards', payload, { idemKey: genIdemKey() })
}

export function removeBankCard(cardId: string): Promise<{ ok: true }> {
  return post(`/rider/wallet/cards/${cardId}/remove`, {}, { idemKey: genIdemKey() })
}

export function applyWithdraw(payload: {
  amount: string
  cardId: string
}): Promise<{ ok: true; withdrawNo: string }> {
  return post('/rider/wallet/withdraw', payload, { idemKey: genIdemKey() })
}

export function fetchWithdrawHistory(query: {
  limit?: number
  cursor?: string | null
}): Promise<WithdrawApply[]> {
  return get('/rider/wallet/withdraw/history', query as Record<string, unknown>, { silent: true })
}

export function fetchSalaryRule(): Promise<SalaryRule> {
  return get<SalaryRule>('/rider/wallet/salary-rule', {}, { silent: true })
}

/**
 * 导出薪资 CSV：返回下载 URL（后端生成 + 7 天有效）
 */
export function exportSalary(payload: {
  startDate: string
  endDate: string
}): Promise<{ url: string; expiresAt: string }> {
  return post('/rider/wallet/salary/export', payload, { idemKey: genIdemKey() })
}
