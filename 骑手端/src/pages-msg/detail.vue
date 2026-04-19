<template>
  <view class="page">
    <view v-if="msg" class="card">
      <view class="title">{{ msg.title }}</view>
      <view class="time">{{ formatTime(msg.createdAt) }}</view>
      <view class="body">{{ msg.body }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { useMsgStore } from '@/store'
  import type { Message } from '@/types/biz'
  import { formatTime } from '@/utils/format'

  /**
   * 消息详情
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const msgStore = useMsgStore()
  const msgId = ref('')

  const msg = computed<Message | null>(() => {
    if (!msgId.value) return null
    for (const cat of Object.values(msgStore.cats)) {
      const m = cat.list.find((it) => it.id === msgId.value)
      if (m) return m
    }
    return null
  })

  onLoad((q) => {
    const params = q as Record<string, string | undefined>
    msgId.value = params.id ?? ''
    if (msgId.value && msg.value && msg.value.isRead === 0) {
      void msgStore.markRead(msgId.value)
    }
  })
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .title {
    font-size: 32rpx;
    font-weight: 600;
  }

  .time {
    margin: 8rpx 0 24rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .body {
    font-size: 26rpx;
    line-height: 1.8;
    color: $uni-text-color;
  }
</style>
