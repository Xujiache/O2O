/**
 * @file api/msg.ts
 * @stage P7/T7.42 (Sprint 6)
 * @desc 消息中心
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type { Message, MessageCategory, KeysetPageResult } from '@/types/biz'
import { get, post, genIdemKey } from '@/utils/request'

export function fetchMessages(query: {
  category: MessageCategory
  cursor?: string | null
  limit?: number
}): Promise<KeysetPageResult<Message>> {
  return get('/rider/messages', query as Record<string, unknown>, { silent: true })
}

export function fetchUnread(): Promise<Record<MessageCategory, number>> {
  return get('/rider/messages/unread', {}, { silent: true })
}

export function markRead(messageId: string): Promise<{ ok: true }> {
  return post(`/rider/messages/${messageId}/read`, {}, { idemKey: genIdemKey(), silent: true })
}

export function markAllRead(category: MessageCategory): Promise<{ ok: true }> {
  return post('/rider/messages/read-all', { category }, { idemKey: genIdemKey(), silent: true })
}
