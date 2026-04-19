<template>
  <view class="page page-wr">
    <scroll-view scroll-y class="wr-list" @scrolltolower="loadMore">
      <view v-for="w in records" :key="w.id" class="wr-item">
        <view class="row-between">
          <text class="wr-amount">{{ formatAmount(w.amount, '') }} 元</text>
          <text class="wr-status" :class="`wr-status--${w.status}`">{{
            statusText(w.status)
          }}</text>
        </view>
        <text class="wr-card">{{ w.cardName }}</text>
        <text class="wr-time">申请：{{ formatTime(w.createdAt) }}</text>
        <text v-if="w.finishedAt" class="wr-time">完成：{{ formatTime(w.finishedAt) }}</text>
        <text v-if="w.rejectReason" class="wr-reason">原因：{{ w.rejectReason }}</text>
      </view>
      <BizEmpty v-if="!loading && records.length === 0" title="暂无提现记录" scene="finance" />
      <BizLoading v-if="loading" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import type { WithdrawApply } from '@/types/biz'
  import { listWithdraws } from '@/api/wallet'
  import { mockEnabled, delay } from '@/api/_mock'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 提现记录（T6.31）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const records = ref<WithdrawApply[]>([])
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)

  const STATUS_TEXT: Record<number, string> = {
    1: '待审核',
    2: '已通过',
    3: '已打款',
    4: '已拒绝',
    5: '失败'
  }

  function statusText(s: number) {
    return STATUS_TEXT[s] ?? '-'
  }

  onMounted(() => {
    void loadMore()
  })

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      if (mockEnabled()) {
        records.value = await delay([
          {
            id: 'wd-1',
            amount: '500.00',
            cardId: 'bc-1',
            cardName: '工行 (****1234)',
            status: 3,
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            finishedAt: new Date(Date.now() - 3600000).toISOString()
          }
        ] as WithdrawApply[])
        hasMore.value = false
      } else {
        const r = await listWithdraws({ cursor: cursor.value, limit: 20 })
        records.value.push(...r.list)
        cursor.value = r.nextCursor
        hasMore.value = r.hasMore
      }
    } catch (e) {
      logger.warn('wr.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-wr {
    min-height: 100vh;
    background: $uni-bg-color-grey;
  }

  .wr-list {
    height: 100vh;
    padding: 16rpx;
  }

  .wr-item {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 12rpx;
  }

  .wr-amount {
    font-size: 32rpx;
    font-weight: 600;
  }

  .wr-status {
    padding: 4rpx 16rpx;
    font-size: 22rpx;
    border-radius: 999rpx;

    &--1 {
      color: $uni-color-warning;
      background: rgb(250 140 22 / 12%);
    }

    &--2 {
      color: $uni-color-primary;
      background: $uni-color-primary-light;
    }

    &--3 {
      color: $uni-color-success;
      background: rgb(82 196 26 / 12%);
    }

    &--4,
    &--5 {
      color: $uni-color-error;
      background: rgb(255 77 79 / 12%);
    }
  }

  .wr-card {
    display: block;
    margin-top: 8rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .wr-time {
    display: block;
    margin-top: 4rpx;
    font-size: 22rpx;
    color: $uni-text-color-placeholder;
  }

  .wr-reason {
    display: block;
    margin-top: 8rpx;
    font-size: 22rpx;
    color: $uni-color-error;
  }
</style>
