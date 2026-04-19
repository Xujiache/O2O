<template>
  <view class="page page-white msg-detail">
    <BizLoading v-if="loading" />
    <view v-else-if="msg" class="msg-detail__content">
      <view class="msg-detail__header">
        <view class="msg-detail__cat" :class="catClass">
          <text>{{ catText }}</text>
        </view>
        <text class="msg-detail__time">{{ timeText }}</text>
      </view>
      <text class="msg-detail__title">{{ msg.title }}</text>
      <text class="msg-detail__body">{{ msg.body }}</text>

      <view v-if="orderLink" class="msg-detail__link" @tap="goLink">
        <text class="msg-detail__link-text">查看订单详情</text>
        <text class="msg-detail__link-arrow">›</text>
      </view>
    </view>
    <BizError v-else title="消息不存在" desc="可能已被删除" @retry="loadMsg" />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-msg/detail.vue
   * @stage P5/T5.44 (Sprint 7)
   * @desc 消息详情：标题/正文/时间/关联订单跳转 + 进入页时 markRead
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizError from '@/components/biz/BizError.vue'
  import { listMessages, markRead } from '@/api/msg'
  import { useMsgStore } from '@/store/msg'
  import { formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import type { Message } from '@/types/biz'

  const msgStore = useMsgStore()

  const id = ref<string>('')
  const msg = ref<Message | null>(null)
  const loading = ref<boolean>(true)

  const catText = computed<string>(() => {
    const c = msg.value?.category
    if (c === 'order') return '订单消息'
    if (c === 'promotion') return '优惠活动'
    if (c === 'system') return '系统通知'
    return '消息'
  })

  const catClass = computed<string>(() => {
    const c = msg.value?.category
    return c ? `msg-detail__cat--${c}` : ''
  })

  const timeText = computed<string>(() => {
    return msg.value ? formatTime(msg.value.createdAt, 'YYYY-MM-DD HH:mm') : ''
  })

  /**
   * 关联跳转链接：优先 link 字段；否则若 category=order 且有 bizNo 则跳订单详情
   * 为安全起见，仅允许 / 开头的内部路径，禁止 http(s) 外链
   */
  const orderLink = computed<string>(() => {
    if (!msg.value) return ''
    if (msg.value.link && /^\//.test(msg.value.link)) return msg.value.link
    if (msg.value.category === 'order' && msg.value.bizNo) {
      return `/pages-order/detail?orderNo=${encodeURIComponent(msg.value.bizNo)}`
    }
    return ''
  })

  onLoad((options?: Record<string, string | undefined>) => {
    const i = options?.id
    if (!i) {
      uni.showToast({ title: '参数缺失', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return
    }
    id.value = i
    void loadMsg()
  })

  async function loadMsg(): Promise<void> {
    loading.value = true
    try {
      msg.value = await fetchMessage(id.value)
      if (msg.value && msg.value.isRead === 0) {
        msg.value.isRead = 1
        msgStore.markRead(id.value)
        try {
          await markRead(id.value)
        } catch (e) {
          logger.warn('msg.detail.markRead.fail', { id: id.value, e: String(e) })
        }
      }
    } catch (e) {
      logger.warn('msg.detail.load.fail', { id: id.value, e: String(e) })
    } finally {
      loading.value = false
    }
  }

  /**
   * 拉取单条消息：优先用 store 缓存（消息列表已加载），fallback 调 listMessages
   * （后端未提供 GET /me/messages/:id，故采用 store 缓存策略）
   */
  async function fetchMessage(messageId: string): Promise<Message | null> {
    const cached = msgStore.messages.find((m) => m.id === messageId)
    if (cached) return { ...cached }
    /* 直链进入或刷新：拉一页消息再筛选（兜底，命中率较高） */
    try {
      const r = await listMessages({ pageSize: 50 })
      const found = r.list.find((m) => m.id === messageId)
      return found ? { ...found } : null
    } catch (e) {
      logger.warn('msg.detail.fetch.fail', { id: messageId, e: String(e) })
      return null
    }
  }

  function goLink(): void {
    if (!orderLink.value) return
    uni.navigateTo({ url: orderLink.value })
  }
</script>

<style lang="scss" scoped>
  .msg-detail {
    min-height: 100vh;
    padding: 32rpx;
    background: #fff;

    &__content {
      display: flex;
      flex-direction: column;
    }

    &__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 24rpx;
      border-bottom: 1rpx solid #f2f2f2;
    }

    &__cat {
      display: inline-flex;
      align-items: center;
      padding: 4rpx 16rpx;
      font-size: 22rpx;
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

    &__time {
      font-size: 24rpx;
      color: #999;
    }

    &__title {
      margin-top: 32rpx;
      font-size: 36rpx;
      font-weight: 600;
      line-height: 1.4;
      color: #333;
    }

    &__body {
      margin-top: 24rpx;
      font-size: 28rpx;
      line-height: 1.7;
      color: #666;
      white-space: pre-wrap;
      word-break: break-all;
    }

    &__link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24rpx;
      margin-top: 48rpx;
      background: #f5f6f8;
      border-radius: 16rpx;
    }

    &__link-text {
      font-size: 28rpx;
      color: #ff6a1a;
    }

    &__link-arrow {
      font-size: 32rpx;
      color: #ff6a1a;
    }
  }
</style>
