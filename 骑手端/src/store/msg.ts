/**
 * @file store/msg.ts
 * @stage P7/T7.42 (Sprint 6)
 * @desc 消息中心 Store：分类列表、未读数、系统事件
 *
 * 分类（DESIGN_P7 §3.8）：order / system / reward / promotion
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Message, MessageCategory } from '@/types/biz'
import { get, post, genIdemKey } from '@/utils/request'
import { logger } from '@/utils/logger'

const PAGE_SIZE = 20

interface CategoryState {
  list: Message[]
  cursor: string | null
  hasMore: boolean
  loading: boolean
}

function emptyCat(): CategoryState {
  return { list: [], cursor: null, hasMore: true, loading: false }
}

export const useMsgStore = defineStore('msg', () => {
  const cats = ref<Record<MessageCategory, CategoryState>>({
    order: emptyCat(),
    system: emptyCat(),
    reward: emptyCat(),
    promotion: emptyCat()
  })
  const unreadCounts = ref<Record<MessageCategory, number>>({
    order: 0,
    system: 0,
    reward: 0,
    promotion: 0
  })

  const totalUnread = computed(() =>
    Object.values(unreadCounts.value).reduce((sum, n) => sum + n, 0)
  )

  /** 加载某分类列表 */
  async function loadCategory(cat: MessageCategory, refresh = false): Promise<void> {
    const state = cats.value[cat]
    if (state.loading) return
    if (!refresh && !state.hasMore) return
    state.loading = true
    try {
      const data = await get<{
        list: Message[]
        nextCursor: string | null
        hasMore: boolean
      }>(
        '/rider/messages',
        { category: cat, cursor: refresh ? null : state.cursor, limit: PAGE_SIZE },
        { silent: true, retry: 1 }
      )
      const list = Array.isArray(data?.list) ? data.list : []
      if (refresh) state.list = list
      else state.list.push(...list)
      state.cursor = data?.nextCursor ?? null
      state.hasMore = Boolean(data?.hasMore)
    } catch (e) {
      logger.warn('msg.list.fail', { cat, e: String(e) })
    } finally {
      state.loading = false
    }
  }

  /** 拉未读数 */
  async function loadUnreadCounts(): Promise<void> {
    try {
      const data = await get<Record<MessageCategory, number>>(
        '/rider/messages/unread',
        {},
        { silent: true, retry: 1 }
      )
      unreadCounts.value = { ...unreadCounts.value, ...data }
    } catch (e) {
      logger.warn('msg.unread.fail', { e: String(e) })
    }
  }

  /** 标记一条已读 */
  async function markRead(messageId: string): Promise<boolean> {
    try {
      await post(
        `/rider/messages/${messageId}/read`,
        {},
        { idemKey: genIdemKey(), silent: true, retry: 1 }
      )
      for (const cat of Object.keys(cats.value) as MessageCategory[]) {
        const m = cats.value[cat].list.find((it) => it.id === messageId)
        if (m && m.isRead === 0) {
          m.isRead = 1
          unreadCounts.value[cat] = Math.max(0, unreadCounts.value[cat] - 1)
        }
      }
      return true
    } catch (e) {
      logger.warn('msg.read.fail', { id: messageId, e: String(e) })
      return false
    }
  }

  /** 全部已读（按分类） */
  async function markAllRead(cat: MessageCategory): Promise<boolean> {
    try {
      await post(
        '/rider/messages/read-all',
        { category: cat },
        { idemKey: genIdemKey(), silent: true, retry: 1 }
      )
      for (const m of cats.value[cat].list) m.isRead = 1
      unreadCounts.value[cat] = 0
      return true
    } catch (e) {
      logger.warn('msg.read-all.fail', { cat, e: String(e) })
      return false
    }
  }

  /** WS 新消息 */
  function handleNewMessage(msg: Message): void {
    if (!msg?.id || !msg.category) return
    const state = cats.value[msg.category]
    if (state) {
      const exists = state.list.find((it) => it.id === msg.id)
      if (!exists) state.list.unshift(msg)
    }
    if (msg.isRead === 0) {
      unreadCounts.value[msg.category] = (unreadCounts.value[msg.category] ?? 0) + 1
    }
  }

  /** 系统事件落库（如转单结果 / 紧急回执） */
  function handleSystemEvent(topic: string, data: Record<string, unknown>): void {
    const msg: Message = {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: 'system',
      title: topic,
      body: JSON.stringify(data),
      isRead: 0,
      createdAt: new Date().toISOString()
    }
    cats.value.system.list.unshift(msg)
    unreadCounts.value.system = (unreadCounts.value.system ?? 0) + 1
  }

  function reset(): void {
    for (const k of Object.keys(cats.value) as MessageCategory[]) {
      cats.value[k] = emptyCat()
      unreadCounts.value[k] = 0
    }
  }

  return {
    cats,
    unreadCounts,
    totalUnread,
    loadCategory,
    loadUnreadCounts,
    markRead,
    markAllRead,
    handleNewMessage,
    handleSystemEvent,
    reset
  }
})
