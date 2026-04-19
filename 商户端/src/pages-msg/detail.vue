<template>
  <view class="page page-md">
    <view v-if="msg" class="md-card">
      <text class="md-title">{{ msg.title }}</text>
      <text class="md-time">{{ formatTime(msg.createdAt) }}</text>
      <text class="md-body">{{ msg.body }}</text>
    </view>
    <BizEmpty v-else title="消息不存在" />
  </view>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import type { Message } from '@/types/biz'
  import { useMsgStore } from '@/store'
  import { formatTime } from '@/utils/format'

  /**
   * 消息详情（T6.34）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const msgStore = useMsgStore()
  const msg = ref<Message | null>(null)

  onLoad((opt) => {
    const id = (opt as Record<string, string> | undefined)?.id
    if (!id) return
    msg.value = msgStore.messages.find((m) => m.id === id) ?? null
  })
</script>

<style lang="scss" scoped>
  .page-md {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .md-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .md-title {
    display: block;
    font-size: 32rpx;
    font-weight: 600;
  }

  .md-time {
    display: block;
    margin-top: 8rpx;
    margin-bottom: 24rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .md-body {
    display: block;
    font-size: 28rpx;
    line-height: 1.7;
    color: $uni-text-color;
  }
</style>
