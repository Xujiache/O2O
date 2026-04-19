<template>
  <view class="page page-msg">
    <!-- 分类 Tab -->
    <view class="msg-tabs">
      <view
        v-for="t in tabs"
        :key="t.key"
        class="msg-tab"
        :class="{ 'msg-tab--active': curTab === t.key }"
        @click="onTabChange(t.key)"
      >
        <text class="msg-tab__label">{{ t.label }}</text>
        <text v-if="unreadOf(t.key) > 0" class="msg-tab__badge">{{ unreadOf(t.key) }}</text>
      </view>
    </view>

    <!-- 全部已读 -->
    <view class="msg-actions">
      <text class="msg-mark-all" @click="onMarkAll">全部已读</text>
    </view>

    <!-- 列表 -->
    <scroll-view scroll-y class="msg-list" @scrolltolower="loadMore">
      <view
        v-for="m in messages"
        :key="m.id"
        class="msg-item"
        :class="{ 'msg-item--unread': m.isRead === 0 }"
        @click="onClick(m)"
      >
        <view class="row-between">
          <text class="msg-item__title">{{ m.title }}</text>
          <text class="msg-item__time">{{ fromNow(m.createdAt) }}</text>
        </view>
        <text class="msg-item__body">{{ m.body }}</text>
      </view>
      <BizEmpty v-if="!loading && messages.length === 0" title="暂无消息" />
      <BizLoading v-if="loading" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useMsgStore } from '@/store'
  import type { Message, MessageCategory } from '@/types/biz'
  import { listMessages, markRead, markAllRead, getUnreadCount } from '@/api/msg'
  import { mockEnabled, mockMessages, delay } from '@/api/_mock'
  import { fromNow } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 消息中心（T6.34）
   *
   * Tab：全部 / 订单 / 系统 / 营销 / 财务
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const msgStore = useMsgStore()

  const tabs: { key: 'all' | MessageCategory; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'order', label: '订单' },
    { key: 'system', label: '系统' },
    { key: 'promotion', label: '营销' },
    { key: 'finance', label: '财务' }
  ]
  const curTab = ref<'all' | MessageCategory>('all')

  const messages = ref<Message[]>([])
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)

  function unreadOf(k: 'all' | MessageCategory): number {
    if (k === 'all') return msgStore.totalUnread
    return msgStore.unreadByCategory[k]
  }

  onMounted(async () => {
    await loadUnread()
    await refresh()
  })

  async function loadUnread() {
    try {
      if (mockEnabled()) {
        msgStore.setUnreadAll({ order: 1, system: 1, promotion: 0, finance: 0 })
      } else {
        const r = await getUnreadCount()
        msgStore.setUnreadAll(r.byCategory)
      }
    } catch (e) {
      logger.warn('msg.unread.fail', { e: String(e) })
    }
  }

  function onTabChange(k: 'all' | MessageCategory) {
    if (curTab.value === k) return
    curTab.value = k
    void refresh()
  }

  async function refresh() {
    cursor.value = null
    hasMore.value = true
    messages.value = []
    await loadMore()
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      if (mockEnabled()) {
        const filtered =
          curTab.value === 'all'
            ? mockMessages
            : mockMessages.filter((m) => m.category === curTab.value)
        messages.value = await delay(filtered)
        hasMore.value = false
      } else {
        const r = await listMessages({
          category: curTab.value === 'all' ? undefined : curTab.value,
          cursor: cursor.value,
          limit: 20
        })
        messages.value.push(...r.list)
        cursor.value = r.nextCursor
        hasMore.value = r.hasMore
      }
    } catch (e) {
      logger.warn('msg.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  async function onClick(m: Message) {
    if (m.isRead === 0) {
      try {
        if (!mockEnabled()) await markRead(m.id)
        msgStore.markRead(m.id)
        m.isRead = 1
      } catch (e) {
        logger.warn('msg.markRead.fail', { e: String(e) })
      }
    }
    if (m.link) {
      uni.navigateTo({ url: m.link })
    } else if (m.bizNo && m.category === 'order') {
      uni.navigateTo({ url: `/pages-order/detail?orderNo=${m.bizNo}` })
    } else {
      uni.navigateTo({ url: `/pages-msg/detail?id=${m.id}` })
    }
  }

  async function onMarkAll() {
    try {
      if (!mockEnabled()) {
        await markAllRead(curTab.value === 'all' ? undefined : curTab.value)
      }
      msgStore.markAllRead(curTab.value === 'all' ? undefined : curTab.value)
      messages.value = messages.value.map((m) => ({ ...m, isRead: 1 }))
      uni.showToast({ title: '已全部标为已读', icon: 'success' })
    } catch (e) {
      logger.warn('msg.markAll.fail', { e: String(e) })
    }
  }
</script>

<style lang="scss" scoped>
  .page-msg {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $uni-bg-color-grey;
  }

  .msg-tabs {
    display: flex;
    padding: 0 16rpx;
    background: #fff;
    border-bottom: 1rpx solid $uni-border-color;
  }

  .msg-tab {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 24rpx 0;
    font-size: 24rpx;
    color: $uni-text-color-grey;

    &--active {
      font-weight: 500;
      color: $uni-color-primary;
      border-bottom: 4rpx solid $uni-color-primary;
    }

    &__badge {
      padding: 0 8rpx;
      margin-left: 4rpx;
      font-size: 18rpx;
      color: #fff;
      background: $uni-color-error;
      border-radius: 999rpx;
    }
  }

  .msg-actions {
    padding: 16rpx 24rpx;
    text-align: right;
    background: #fff;
  }

  .msg-mark-all {
    font-size: 22rpx;
    color: $uni-color-primary;
  }

  .msg-list {
    flex: 1;
    padding: 16rpx;
  }

  .msg-item {
    padding: 24rpx;
    margin-bottom: 12rpx;
    background: #fff;
    border-radius: 12rpx;

    &--unread {
      border-left: 6rpx solid $uni-color-error;
    }

    &__title {
      font-size: 28rpx;
      font-weight: 500;
    }

    &__time {
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__body {
      display: block;
      margin-top: 8rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }
  }
</style>
