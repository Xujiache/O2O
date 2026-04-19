/**
 * @file api/invoice.ts
 * @stage P6/T6.32 (Sprint 4)
 * @desc 发票 API：申请 / 记录 / 抬头管理
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, post, put, del, genIdemKey } from '@/utils/request'
import type { InvoiceApply, KeysetPageResult } from '@/types/biz'

/** 发票抬头 */
export interface InvoiceHeader {
  id: string
  titleType: 1 | 2
  title: string
  taxNo?: string
  bankName?: string
  bankAccount?: string
  registerAddress?: string
  registerPhone?: string
  email?: string
  isDefault: 0 | 1
}

export function listInvoiceHeaders(): Promise<InvoiceHeader[]> {
  return get('/merchant/invoice/headers')
}

export function createInvoiceHeader(payload: Omit<InvoiceHeader, 'id'>): Promise<InvoiceHeader> {
  return post('/merchant/invoice/headers', payload, { idemKey: genIdemKey() })
}

export function updateInvoiceHeader(
  id: string,
  payload: Partial<Omit<InvoiceHeader, 'id'>>
): Promise<InvoiceHeader> {
  return put(`/merchant/invoice/headers/${id}`, payload)
}

export function deleteInvoiceHeader(id: string): Promise<{ ok: boolean }> {
  return del(`/merchant/invoice/headers/${id}`)
}

/** 申请发票（合并多笔订单） */
export function applyInvoice(payload: {
  orderNos: string[]
  amount: string
  titleType: 1 | 2
  title: string
  taxNo?: string
  email: string
}): Promise<InvoiceApply> {
  return post('/merchant/invoice/apply', payload, { idemKey: genIdemKey() })
}

/** 发票记录 */
export function listInvoices(params?: {
  status?: 1 | 2 | 3
  cursor?: string | null
  limit?: number
}): Promise<KeysetPageResult<InvoiceApply>> {
  return get('/merchant/invoice/list', params as unknown as Record<string, unknown>)
}
