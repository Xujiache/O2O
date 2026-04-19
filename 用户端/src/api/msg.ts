/**
 * @file api/msg.ts
 * @stage P5/T5.44 (Sprint 7)
 * @desc 消息中心 API：站内信 列表 / 已读 / 删除
 * @author 单 Agent V2.0
 */
import { get, post, del } from '@/utils/request'
import type { Message, KeysetPageResult } from '@/types/biz'

export function listMessages(params?: {
  category?: string
  cursor?: string
  pageSize?: number
}): Promise<KeysetPageResult<Message>> {
  return get('/me/messages', params as Record<string, unknown>)
}

export function getUnreadCount(): Promise<{ total: number; byCategory: Record<string, number> }> {
  return get('/me/messages/unread-count')
}

export function markRead(id: string): Promise<{ ok: boolean }> {
  return post(`/me/messages/${id}/read`)
}

export function markAllRead(category?: string): Promise<{ ok: boolean }> {
  return post('/me/messages/read-all', { category })
}

export function removeMessage(id: string): Promise<{ ok: boolean }> {
  return del(`/me/messages/${id}`)
}

export function getSubscribeTemplates(): Promise<{ tmplIds: string[] }> {
  return get('/me/messages/subscribe-templates')
}
