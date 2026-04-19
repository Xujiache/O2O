/**
 * @file api/msg.ts
 * @stage P6/T6.34 (Sprint 5)
 * @desc 消息中心 API：列表 / 已读 / 未读统计
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, post, del } from '@/utils/request'
import type { Message, MessageCategory, KeysetPageResult } from '@/types/biz'

export function listMessages(params?: {
  category?: MessageCategory
  isRead?: 0 | 1
  cursor?: string | null
  limit?: number
}): Promise<KeysetPageResult<Message>> {
  return get('/merchant/messages', params as unknown as Record<string, unknown>)
}

export function getUnreadCount(): Promise<{
  total: number
  byCategory: Record<MessageCategory, number>
}> {
  return get('/merchant/messages/unread-count')
}

export function markRead(id: string): Promise<{ ok: boolean }> {
  return post(`/merchant/messages/${id}/read`, {})
}

export function markAllRead(category?: MessageCategory): Promise<{ ok: boolean }> {
  return post('/merchant/messages/read-all', { category })
}

export function removeMessage(id: string): Promise<{ ok: boolean }> {
  return del(`/merchant/messages/${id}`)
}

export function getSubscribeTemplates(): Promise<{ tmplIds: string[] }> {
  return get('/merchant/messages/subscribe-templates')
}
