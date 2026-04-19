/**
 * @file api/invoice.ts
 * @stage P5/T5.38 (Sprint 6)
 * @desc 发票 API：抬头 CRUD / 申请 / 历史
 * @author 单 Agent V2.0
 */
import { get, post, put, del } from '@/utils/request'
import type { InvoiceHeader, Invoice, KeysetPageResult } from '@/types/biz'

/* 抬头 */
export function listInvoiceHeaders(): Promise<InvoiceHeader[]> {
  return get('/me/invoice-headers')
}

export function createInvoiceHeader(payload: Omit<InvoiceHeader, 'id'>): Promise<InvoiceHeader> {
  return post('/me/invoice-headers', payload)
}

export function updateInvoiceHeader(
  id: string,
  payload: Partial<Omit<InvoiceHeader, 'id'>>
): Promise<InvoiceHeader> {
  return put(`/me/invoice-headers/${id}`, payload)
}

export function deleteInvoiceHeader(id: string): Promise<{ ok: boolean }> {
  return del(`/me/invoice-headers/${id}`)
}

/* 申请 */
export function applyInvoice(payload: {
  orderNo: string
  titleType: 1 | 2
  title: string
  taxNo?: string
  email: string
  amount?: string
}): Promise<Invoice> {
  return post('/me/invoices', payload)
}

export function listInvoices(params?: {
  status?: number
  cursor?: string
  pageSize?: number
}): Promise<KeysetPageResult<Invoice>> {
  return get('/me/invoices', params as Record<string, unknown>)
}
