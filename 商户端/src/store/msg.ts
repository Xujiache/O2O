/**
 * @file store/msg.ts
 * @stage P6/T6.4 (Sprint 1)
 * @desc 消息中心 Store：未读数（按分类）、消息列表
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Message, MessageCategory } from '@/types/biz'

export const useMsgStore = defineStore('msg', () => {
  const unreadByCategory = ref<Record<MessageCategory, number>>({
    order: 0,
    system: 0,
    promotion: 0,
    finance: 0
  })
  const messages = ref<Message[]>([])

  const totalUnread = computed<number>(
    () =>
      unreadByCategory.value.order +
      unreadByCategory.value.system +
      unreadByCategory.value.promotion +
      unreadByCategory.value.finance
  )

  function setUnread(category: MessageCategory, n: number) {
    unreadByCategory.value[category] = Math.max(0, n)
  }

  function setUnreadAll(map: Partial<Record<MessageCategory, number>>) {
    unreadByCategory.value = { ...unreadByCategory.value, ...map }
  }

  function setMessages(list: Message[]) {
    messages.value = list
  }

  function markRead(id: string) {
    const idx = messages.value.findIndex((m) => m.id === id)
    if (idx >= 0 && messages.value[idx].isRead === 0) {
      messages.value[idx].isRead = 1
      const cat = messages.value[idx].category
      unreadByCategory.value[cat] = Math.max(0, unreadByCategory.value[cat] - 1)
    }
  }

  function markAllRead(category?: MessageCategory) {
    if (category) {
      messages.value = messages.value.map((m) =>
        m.category === category ? { ...m, isRead: 1 } : m
      )
      unreadByCategory.value[category] = 0
    } else {
      messages.value = messages.value.map((m) => ({ ...m, isRead: 1 }))
      unreadByCategory.value = { order: 0, system: 0, promotion: 0, finance: 0 }
    }
  }

  function removeMsg(id: string) {
    messages.value = messages.value.filter((m) => m.id !== id)
  }

  return {
    unreadByCategory,
    messages,
    totalUnread,
    setUnread,
    setUnreadAll,
    setMessages,
    markRead,
    markAllRead,
    removeMsg
  }
})
