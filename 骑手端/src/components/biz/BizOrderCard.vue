<template>
  <view class="card" :class="{ 'card--abnormal': order.isException === 1 }" @click="onClick">
    <view class="card__header">
      <view class="card__biz" :class="`card__biz--${order.businessType}`">
        {{ order.businessType === 1 ? '外卖' : '跑腿' }}
      </view>
      <view class="card__status">{{ statusText }}</view>
      <view v-if="order.isException === 1" class="card__abnormal-badge">异常</view>
    </view>

    <view class="card__row">
      <text class="card__dot card__dot--from">A</text>
      <view class="card__col">
        <text class="card__name">{{ order.pickupName }}</text>
        <text class="card__addr">{{ order.pickupAddress }}</text>
      </view>
    </view>
    <view class="card__row">
      <text class="card__dot card__dot--to">B</text>
      <view class="card__col">
        <text class="card__name">{{ order.deliverName }}</text>
        <text class="card__addr">{{ order.deliverAddress }}</text>
      </view>
    </view>

    <view class="card__footer">
      <text class="card__income">{{ formatAmount(order.totalIncome) }}</text>
      <text class="card__time">{{ fromNow(order.acceptedAt ?? order.createdAt) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { RiderOrder, RiderOrderStatus } from '@/types/biz'
  import { RIDER_ORDER_STATUS_TEXT } from '@/types/biz'
  import { formatAmount, fromNow } from '@/utils/format'

  /**
   * 订单卡片（订单列表 / 工作台进行中聚合用）
   * @author 单 Agent V2.0 (P7 骑手端 / T7.17)
   */
  interface Props {
    order: RiderOrder
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{
    (e: 'click', orderNo: string): void
  }>()

  const statusText = computed<string>(() => {
    const s = props.order.status as RiderOrderStatus
    return RIDER_ORDER_STATUS_TEXT[s] ?? '处理中'
  })

  function onClick() {
    emit('click', props.order.orderNo)
  }
</script>

<style lang="scss" scoped>
  .card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-left: 6rpx solid transparent;
    border-radius: 16rpx;
    box-shadow: $rider-card-shadow;

    &--abnormal {
      border-left-color: $uni-color-error;
    }

    &__header {
      display: flex;
      align-items: center;
      margin-bottom: 16rpx;
    }

    &__biz {
      padding: 4rpx 12rpx;
      margin-right: 12rpx;
      font-size: 22rpx;
      color: #fff;
      border-radius: 8rpx;

      &--1 {
        background: $uni-color-primary;
      }

      &--2 {
        background: #fa8c16;
      }
    }

    &__status {
      flex: 1;
      font-size: 26rpx;
      font-weight: 600;
      color: $uni-color-primary;
    }

    &__abnormal-badge {
      padding: 4rpx 12rpx;
      font-size: 22rpx;
      color: #fff;
      background: $uni-color-error;
      border-radius: 8rpx;
    }

    &__row {
      display: flex;
      align-items: flex-start;
      padding: 8rpx 0;
    }

    &__dot {
      width: 32rpx;
      height: 32rpx;
      margin-top: 4rpx;
      margin-right: 12rpx;
      font-size: 18rpx;
      font-weight: 600;
      line-height: 32rpx;
      color: #fff;
      text-align: center;
      border-radius: 50%;

      &--from {
        background: #fa8c16;
      }

      &--to {
        background: $uni-color-primary;
      }
    }

    &__col {
      flex: 1;
    }

    &__name {
      display: block;
      font-size: 26rpx;
      font-weight: 500;
      color: $uni-text-color;
    }

    &__addr {
      display: block;
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 16rpx;
      margin-top: 8rpx;
      border-top: 1rpx solid $uni-border-color;
    }

    &__income {
      font-size: 28rpx;
      font-weight: 700;
      color: $uni-color-error;
    }

    &__time {
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }
</style>
