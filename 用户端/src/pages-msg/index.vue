<template>
  <view class="page msg">
    <view class="msg__header">
      <scroll-view scroll-x class="msg__tabs-scroll">
        <view class="msg__tabs">
          <view
            v-for="(t, i) in tabs"
            :key="t.value"
            class="msg__tab"
            :class="{ 'msg__tab--active': activeTab === i }"
            @tap="onTabChange(i)"
          >
            <text>{{ t.label }}</text>
            <view v-if="getCatUnread(t.value) > 0" class="msg__tab-badge">
              <text>{{ getCatUnread(t.value) > 99 ? '99+' : getCatUnread(t.value) }}</text>
            </view>
          </view>
        </view>
      </scroll-view>
      <view
        v-if="messages.length > 0"
        class="msg__all-read"
        :class="{ 'msg__all-read--disabled': totalUnread === 0 }"
        @tap="onAllRead"
      >
        <text>全部已读</text>
      </view>
    </view>

    <BizLoading v-if="loading && messages.length === 0" />
    <BizEmpty v-else-if="!loading && messages.length === 0" text="暂无消息" />
    <scroll-view
      v-else
      scroll-y
      class="msg__scroll"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="onLoadMore"
    >
      <view
        v-for="m in messages"
        :key="m.id"
        class="msg__card"
        @tap="onMsgTap(m)"
        @longpress="onLongPress(m)"
      >
        <view class="msg__card-icon" :class="iconClass(m.category)">
          <text>{{ catIcon(m.category) }}</text>
          <view v-if="m.isRead === 0" class="msg__dot" />
        </view>
        <view class="msg__card-body">
          <view class="msg__card-head">
            <text class="msg__card-title" :class="{ 'msg__card-title--unread': m.isRead === 0 }">
              {{ m.title }}
            </text>
            <text class="msg__card-time">{{ fromNow(m.createdAt) }}</text>
          </view>
          <text class="msg__card-summary">{{ m.body }}</text>
        </view>
      </view>
      <view v-if="messages.length > 0" class="msg__more">
        <text>{{ moreText }}</text>
      </view>
    </scroll-view>

    <BizDialog
      v-model:visible="dialogVisible"
      title="删除消息"
      :content="dialogContent"
      @confirm="onDeleteConfirm"
      @cancel="onDeleteCancel"
    />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-msg/index.vue
   * @stage P5/T5.44 (Sprint 7)
   * @desc 消息中心：分类 Tab + keyset 分页 + 长按删除 + 全部已读
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import BizDialog from '@/components/biz/BizDialog.vue'
  import { listMessages, getUnreadCount, markRead, markAllRead, removeMessage } from '@/api/msg'
  import { useMsgStore } from '@/store/msg'
  import { useUserStore } from '@/store/user'
  import { fromNow } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import type { Message, MessageCategory } from '@/types/biz'

  type TabValue = '' | MessageCategory

  interface TabItem {
    label: string
    value: TabValue
  }

  const tabs: TabItem[] = [
    { label: '全部', value: '' },
    { label: '订单', value: 'order' },
    { label: '优惠', value: 'promotion' },
    { label: '系统', value: 'system' }
  ]

  const msgStore = useMsgStore()
  const userStore = useUserStore()

  const activeTab = ref<number>(0)
  const messages = ref<Message[]>([])
  const loading = ref<boolean>(false)
  const refreshing = ref<boolean>(false)
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)

  /** 各分类未读数（来自后端 unread-count） */
  const unreadByCat = ref<Record<string, number>>({})
  const totalUnread = ref<number>(0)

  /** 二次确认弹窗 */
  const dialogVisible = ref<boolean>(false)
  const dialogContent = ref<string>('')
  const pendingDelete = ref<Message | null>(null)

  const moreText = computed<string>(() => {
    if (loading.value) return '加载中...'
    return hasMore.value ? '上拉加载更多' : '—— 没有更多了 ——'
  })

  const currentCategory = computed<TabValue>(() => tabs[activeTab.value].value)

  onShow(() => {
    if (!userStore.isLogin) {
      uni.navigateTo({
        url: `/pages/login/index?redirect=${encodeURIComponent('/pages-msg/index')}`
      })
      return
    }
    void loadUnread()
    void load(true)
  })

  /** 拉取未读数 */
  async function loadUnread(): Promise<void> {
    try {
      const r = await getUnreadCount()
      unreadByCat.value = r.byCategory ?? {}
      totalUnread.value = r.total ?? 0
      msgStore.setUnread(totalUnread.value)
    } catch (e) {
      logger.warn('msg.unread.fail', { e: String(e) })
    }
  }

  /** 拉消息列表（reset=true 时清空） */
  async function load(reset: boolean): Promise<void> {
    if (reset) {
      cursor.value = null
      hasMore.value = true
      messages.value = []
    }
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const r = await listMessages({
        category: currentCategory.value || undefined,
        cursor: cursor.value ?? undefined,
        pageSize: 20
      })
      messages.value = reset ? r.list : [...messages.value, ...r.list]
      cursor.value = r.nextCursor
      hasMore.value = r.hasMore
      msgStore.setMessages(messages.value)
    } catch (e) {
      logger.warn('msg.list.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function onTabChange(i: number): void {
    if (activeTab.value === i) return
    activeTab.value = i
    void load(true)
  }

  function onLoadMore(): void {
    void load(false)
  }

  function onRefresh(): void {
    refreshing.value = true
    void Promise.all([loadUnread(), load(true)]).finally(() => {
      refreshing.value = false
    })
  }

  function onMsgTap(m: Message): void {
    if (m.isRead === 0) {
      const idx = messages.value.findIndex((x) => x.id === m.id)
      if (idx >= 0) {
        messages.value[idx].isRead = 1
      }
      msgStore.markRead(m.id)
      decUnreadCat(m.category)
      void markRead(m.id).catch((e) => {
        logger.warn('msg.markRead.fail', { id: m.id, e: String(e) })
      })
    }
    msgStore.setMessages(messages.value)
    uni.navigateTo({ url: `/pages-msg/detail?id=${encodeURIComponent(m.id)}` })
  }

  function onLongPress(m: Message): void {
    pendingDelete.value = m
    dialogContent.value = `确定删除「${m.title.slice(0, 20)}」？`
    dialogVisible.value = true
  }

  async function onDeleteConfirm(): Promise<void> {
    const m = pendingDelete.value
    if (!m) return
    pendingDelete.value = null
    try {
      await removeMessage(m.id)
      messages.value = messages.value.filter((x) => x.id !== m.id)
      msgStore.removeMsg(m.id)
      msgStore.setMessages(messages.value)
      if (m.isRead === 0) decUnreadCat(m.category)
      uni.showToast({ title: '已删除', icon: 'none' })
    } catch (e) {
      logger.warn('msg.remove.fail', { id: m.id, e: String(e) })
    }
  }

  function onDeleteCancel(): void {
    pendingDelete.value = null
  }

  async function onAllRead(): Promise<void> {
    if (totalUnread.value === 0) return
    try {
      await markAllRead(currentCategory.value || undefined)
      const targetCat = currentCategory.value
      messages.value = messages.value.map((m) => {
        if (!targetCat || m.category === targetCat) {
          return { ...m, isRead: 1 }
        }
        return m
      })
      if (targetCat) {
        const drop = unreadByCat.value[targetCat] ?? 0
        unreadByCat.value = { ...unreadByCat.value, [targetCat]: 0 }
        totalUnread.value = Math.max(0, totalUnread.value - drop)
      } else {
        unreadByCat.value = {}
        totalUnread.value = 0
        msgStore.markAllRead()
      }
      msgStore.setUnread(totalUnread.value)
      msgStore.setMessages(messages.value)
      uni.showToast({ title: '已标记全部已读', icon: 'none' })
    } catch (e) {
      logger.warn('msg.allRead.fail', { e: String(e) })
    }
  }

  function getCatUnread(v: TabValue): number {
    if (v === '') return totalUnread.value
    return unreadByCat.value[v] ?? 0
  }

  function decUnreadCat(c: MessageCategory): void {
    const cur = unreadByCat.value[c] ?? 0
    if (cur > 0) {
      unreadByCat.value = { ...unreadByCat.value, [c]: cur - 1 }
    }
    totalUnread.value = Math.max(0, totalUnread.value - 1)
    msgStore.setUnread(totalUnread.value)
  }

  function catIcon(c: MessageCategory): string {
    if (c === 'order') return '订'
    if (c === 'promotion') return '优'
    return '系'
  }

  function iconClass(c: MessageCategory): string {
    return `msg__card-icon--${c}`
  }
</script>

<style lang="scss" scoped>
  .msg {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #f5f6f8;

    &__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #fff;
      border-bottom: 1rpx solid #f2f2f2;
    }

    &__tabs-scroll {
      flex: 1;
      white-space: nowrap;
    }

    &__tabs {
      display: inline-flex;
      align-items: center;
      padding: 0 16rpx;
    }

    &__tab {
      position: relative;
      padding: 24rpx 24rpx;
      font-size: 28rpx;
      color: #666;

      &--active {
        font-weight: 500;
        color: #ff6a1a;
      }

      &--active::after {
        position: absolute;
        right: 24rpx;
        bottom: 0;
        left: 24rpx;
        height: 4rpx;
        content: '';
        background: #ff6a1a;
        border-radius: 4rpx;
      }
    }

    &__tab-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 28rpx;
      height: 28rpx;
      padding: 0 8rpx;
      margin-left: 8rpx;
      font-size: 18rpx;
      color: #fff;
      background: #f56c6c;
      border-radius: 14rpx;
    }

    &__all-read {
      flex-shrink: 0;
      padding: 24rpx 24rpx;
      font-size: 24rpx;
      color: #ff6a1a;

      &--disabled {
        color: #c0c4cc;
      }
    }

    &__scroll {
      flex: 1;
      padding: 16rpx;
    }

    &__card {
      display: flex;
      gap: 24rpx;
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: #fff;
      border-radius: 16rpx;

      &:active {
        background: #f7f7f7;
      }
    }

    &__card-icon {
      position: relative;
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 80rpx;
      height: 80rpx;
      font-size: 28rpx;
      font-weight: 500;
      color: #fff;
      border-radius: 16rpx;

      &--order {
        background: #ff6a1a;
      }

      &--promotion {
        background: #e6a23c;
      }

      &--system {
        background: #909399;
      }
    }

    &__dot {
      position: absolute;
      top: -4rpx;
      right: -4rpx;
      width: 16rpx;
      height: 16rpx;
      background: #f56c6c;
      border: 2rpx solid #fff;
      border-radius: 50%;
    }

    &__card-body {
      flex: 1;
      min-width: 0;
    }

    &__card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8rpx;
    }

    &__card-title {
      flex: 1;
      max-width: 65%;
      overflow: hidden;
      font-size: 30rpx;
      color: #333;
      white-space: nowrap;
      text-overflow: ellipsis;

      &--unread {
        font-weight: 500;
      }
    }

    &__card-time {
      flex-shrink: 0;
      font-size: 22rpx;
      color: #999;
    }

    &__card-summary {
      display: -webkit-box;
      overflow: hidden;
      font-size: 24rpx;
      line-height: 1.5;
      color: #666;
      text-overflow: ellipsis;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    &__more {
      padding: 32rpx 0;
      font-size: 24rpx;
      color: #999;
      text-align: center;
    }
  }
</style>
