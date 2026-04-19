<template>
  <view class="page">
    <view class="cats">
      <view
        v-for="c in catDefs"
        :key="c.value"
        class="cat"
        :class="{ 'cat--active': pickedCat === c.value }"
        @click="pickedCat = c.value"
      >
        {{ c.label }}
        <text v-if="msgStore.unreadCounts[c.value] > 0" class="cat__badge">
          {{ msgStore.unreadCounts[c.value] }}
        </text>
      </view>
    </view>

    <BizLoading v-if="state.loading && state.list.length === 0" />
    <BizEmpty v-else-if="state.list.length === 0" title="暂无消息" scene="msg" />
    <scroll-view v-else scroll-y class="list" @scrolltolower="onLoadMore">
      <view v-for="m in state.list" :key="m.id" class="msg" @click="onClick(m)">
        <view class="msg__col">
          <view class="msg__head">
            <text class="msg__title">{{ m.title }}</text>
            <text v-if="m.isRead === 0" class="msg__dot" />
          </view>
          <text class="msg__body">{{ m.body }}</text>
          <text class="msg__time">{{ formatTime(m.createdAt) }}</text>
        </view>
      </view>
    </scroll-view>

    <BizBtn v-if="state.list.length > 0" type="plain" block @click="onMarkAll">全部已读</BizBtn>
  </view>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { onLoad, onShow } from '@dcloudio/uni-app'
  import { useMsgStore } from '@/store'
  import type { Message, MessageCategory } from '@/types/biz'
  import { mockResolve } from '@/api/_mock'
  import { formatTime } from '@/utils/format'
  import { track, TRACK } from '@/utils/track'

  /**
   * 消息中心：4 分类（订单/系统/奖惩/活动）+ 全部已读
   *   T7.42
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const msgStore = useMsgStore()
  const pickedCat = ref<MessageCategory>('order')

  const catDefs: { value: MessageCategory; label: string }[] = [
    { value: 'order', label: '订单' },
    { value: 'system', label: '系统' },
    { value: 'reward', label: '奖惩' },
    { value: 'promotion', label: '活动' }
  ]

  const state = computed(() => msgStore.cats[pickedCat.value])

  watch(pickedCat, () => {
    if (!state.value.list.length) {
      void msgStore.loadCategory(pickedCat.value, true)
    }
  })

  onLoad(() => {
    track(TRACK.VIEW_MSG)
  })

  onShow(async () => {
    await Promise.all([
      msgStore.loadCategory(pickedCat.value, true).catch(() => {
        msgStore.cats.order.list = mockResolve.messages
      }),
      msgStore.loadUnreadCounts().catch(() => {
        /* mock */
      })
    ])
  })

  function onLoadMore() {
    void msgStore.loadCategory(pickedCat.value)
  }

  function onClick(m: Message) {
    if (m.isRead === 0) void msgStore.markRead(m.id)
    if (m.category === 'order' && m.bizNo) {
      uni.navigateTo({ url: `/pages-order/detail?orderNo=${m.bizNo}` })
      return
    }
    uni.navigateTo({ url: `/pages-msg/detail?id=${m.id}` })
  }

  function onMarkAll() {
    void msgStore.markAllRead(pickedCat.value)
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .cats {
    display: flex;
    gap: 12rpx;
    margin-bottom: 16rpx;
  }

  .cat {
    position: relative;
    flex: 1;
    height: 64rpx;
    font-size: 24rpx;
    line-height: 64rpx;
    color: $uni-text-color-grey;
    text-align: center;
    background: #fff;
    border-radius: 32rpx;

    &--active {
      color: #fff;
      background: $uni-color-primary;
    }

    &__badge {
      position: absolute;
      top: 8rpx;
      right: 16rpx;
      min-width: 24rpx;
      height: 24rpx;
      padding: 0 6rpx;
      font-size: 18rpx;
      line-height: 24rpx;
      color: #fff;
      text-align: center;
      background: $uni-color-error;
      border-radius: 12rpx;
    }
  }

  .list {
    height: calc(100vh - 220rpx);
  }

  .msg {
    padding: 24rpx;
    margin-bottom: 12rpx;
    background: #fff;
    border-radius: 12rpx;

    &__col {
      flex: 1;
    }

    &__head {
      display: flex;
      align-items: center;
      margin-bottom: 8rpx;
    }

    &__title {
      flex: 1;
      font-size: 28rpx;
      font-weight: 600;
    }

    &__dot {
      width: 16rpx;
      height: 16rpx;
      background: $uni-color-error;
      border-radius: 50%;
    }

    &__body {
      display: block;
      font-size: 24rpx;
      line-height: 1.6;
      color: $uni-text-color-grey;
    }

    &__time {
      display: block;
      margin-top: 8rpx;
      font-size: 20rpx;
      color: $uni-text-color-placeholder;
    }
  }
</style>
