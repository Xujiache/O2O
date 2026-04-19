/**
 * @file store/msg.ts
 * @stage P5/T5.5 (Sprint 1)
 * @desc 消息中心 Store：未读数、消息列表
 * @author 单 Agent V2.0
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message } from '@/types/biz'

export const useMsgStore = defineStore('msg', () => {
  const unreadCount = ref<number>(0)
  const messages = ref<Message[]>([])

  function setUnread(n: number) {
    unreadCount.value = Math.max(0, n)
  }
  function setMessages(list: Message[]) {
    messages.value = list
  }
  function markRead(id: string) {
    const idx = messages.value.findIndex((m) => m.id === id)
    if (idx >= 0 && messages.value[idx].isRead === 0) {
      messages.value[idx].isRead = 1
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
  }
  function markAllRead() {
    messages.value = messages.value.map((m) => ({ ...m, isRead: 1 }))
    unreadCount.value = 0
  }
  function removeMsg(id: string) {
    messages.value = messages.value.filter((m) => m.id !== id)
  }

  return { unreadCount, messages, setUnread, setMessages, markRead, markAllRead, removeMsg }
})
