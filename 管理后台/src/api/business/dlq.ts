/**
 * @file dlq.ts
 * @stage P9 Sprint 3 / W3.B.2
 * @desc DLQ 监控 API（管理后台）
 *
 * 后端对应：admin-dlq.controller.ts (/admin/dlq)
 *
 * 用法：
 *   import { dlqApi } from '@/api/business/dlq'
 *   const data = await dlqApi.getDlqList({ page: 1, pageSize: 20 })
 *   await dlqApi.retryDlq(id)
 *   await dlqApi.discardDlq(id)
 */
import { bizApi } from './_request'

/** DLQ 列表查询参数 */
export interface DlqListParams {
  page?: number
  pageSize?: number
  /** 0 PENDING / 1 RETRY_OK / 2 PERMANENT_FAILED / 3 DISCARDED */
  status?: number
  sagaName?: string
  /** ISO 字符串 */
  startAt?: string
  /** ISO 字符串 */
  endAt?: string
}

/** DLQ 列表项 */
export interface DlqItem {
  id: string
  sagaId: string
  sagaName: string
  source: string
  eventName: string
  failedStep: string | null
  status: number
  statusText: string
  retryCount: number
  nextRetryAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

/** 列表响应 */
export interface DlqListResp {
  records: DlqItem[]
  total: number
  page: number
  pageSize: number
}

/** 操作响应 */
export interface DlqActionResp {
  ok: boolean
  message?: string
}

/**
 * DLQ 列表（分页 + 筛选）
 */
export function getDlqList(params: DlqListParams) {
  return bizApi.get<DlqListResp>('/dlq/list', params as Record<string, unknown>)
}

/**
 * 手动重试
 */
export function retryDlq(id: string) {
  return bizApi.post<DlqActionResp>(`/dlq/${id}/retry`, {}, { needSign: true })
}

/**
 * 丢弃 DLQ 记录（标记 DISCARDED）
 */
export function discardDlq(id: string, reason?: string) {
  return bizApi.post<DlqActionResp>(`/dlq/${id}/discard`, { reason }, { needSign: true })
}

/**
 * 聚合命名空间导出（与 business/index.ts 一致风格）
 */
export const dlqApi = {
  getDlqList,
  retryDlq,
  discardDlq
}
