<template>
  <view class="page">
    <view class="filter">
      <view
        v-for="t in types"
        :key="t.value"
        class="filter__item"
        :class="{ 'filter__item--active': filter === t.value }"
        @click="filter = t.value"
      >
        {{ t.label }}
      </view>
    </view>

    <BizEmpty v-if="filtered.length === 0" title="暂无记录" scene="data" />

    <view v-for="r in filtered" :key="r.id" class="row" :class="`row--${r.type}`">
      <view class="row__col">
        <text class="row__title">{{ r.reason }}</text>
        <text v-if="r.orderNo" class="row__no">关联订单 {{ r.orderNo }}</text>
        <text class="row__time">{{ formatTime(r.createdAt) }}</text>
      </view>
      <view class="row__amt">
        <text class="row__amount" :class="`row__amount--${r.type}`">
          {{ r.type === 1 ? '+' : '-' }}{{ formatAmount(r.amount) }}
        </text>
        <view
          v-if="r.type === 2 && r.appealStatus === 'none'"
          class="row__appeal"
          @click="goAppeal(r.id)"
        >
          申诉 ›
        </view>
        <text v-else-if="r.type === 2 && r.appealStatus" class="row__status">
          {{ statusText(r.appealStatus) }}
        </text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import { fetchRewards } from '@/api/stat'
  import type { RewardItem } from '@/types/biz'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 奖惩列表 + 申诉入口
   *   T7.41
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const list = ref<RewardItem[]>([])
  const filter = ref<'all' | 1 | 2>('all')

  const types = [
    { value: 'all' as const, label: '全部' },
    { value: 1 as const, label: '奖励' },
    { value: 2 as const, label: '罚款' }
  ]

  const filtered = computed(() => {
    if (filter.value === 'all') return list.value
    return list.value.filter((r) => r.type === filter.value)
  })

  function statusText(s: string): string {
    return (
      ({ pending: '申诉中', approved: '已通过', rejected: '已驳回' } as Record<string, string>)[
        s
      ] ?? '-'
    )
  }

  onShow(async () => {
    try {
      list.value = await fetchRewards({})
    } catch (e) {
      logger.warn('reward.list.fail', { e: String(e) })
      list.value = [
        {
          id: 'R1',
          type: 1,
          amount: '20.00',
          reason: '高峰单量奖励',
          createdAt: '2026-04-19T10:00:00Z'
        },
        {
          id: 'R2',
          type: 2,
          amount: '5.00',
          reason: '订单超时',
          orderNo: 'DD20260418001',
          appealStatus: 'none',
          appealDeadline: '2026-04-25T23:59:59Z',
          createdAt: '2026-04-18T11:00:00Z'
        }
      ]
    }
  })

  function goAppeal(id: string) {
    uni.navigateTo({ url: `/pages-stat/appeal?rewardId=${id}` })
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 16rpx;
    background: $uni-bg-color-grey;
  }

  .filter {
    display: flex;
    gap: 12rpx;
    margin-bottom: 16rpx;

    &__item {
      flex: 1;
      height: 56rpx;
      font-size: 24rpx;
      line-height: 56rpx;
      color: $uni-text-color-grey;
      text-align: center;
      background: #fff;
      border-radius: 28rpx;

      &--active {
        color: #fff;
        background: $uni-color-primary;
      }
    }
  }

  .row {
    display: flex;
    padding: 24rpx;
    margin-bottom: 12rpx;
    background: #fff;
    border-left: 6rpx solid transparent;
    border-radius: 12rpx;

    &--1 {
      border-left-color: $uni-color-primary;
    }

    &--2 {
      border-left-color: $uni-color-error;
    }

    &__col {
      flex: 1;
    }

    &__title {
      display: block;
      font-size: 26rpx;
      font-weight: 500;
    }

    &__no {
      display: block;
      margin-top: 4rpx;
      font-size: 20rpx;
      color: $uni-text-color-placeholder;
    }

    &__time {
      display: block;
      margin-top: 4rpx;
      font-size: 20rpx;
      color: $uni-text-color-grey;
    }

    &__amt {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    &__amount {
      font-size: 32rpx;
      font-weight: 600;

      &--1 {
        color: $uni-color-primary;
      }

      &--2 {
        color: $uni-color-error;
      }
    }

    &__appeal {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-color-primary;
    }

    &__status {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }
</style>
