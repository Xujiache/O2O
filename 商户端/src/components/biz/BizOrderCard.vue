<template>
  <view class="oc" @click="onClick">
    <view class="oc-header row-between">
      <view class="row">
        <view class="oc-status" :class="`oc-status--${statusKey}`">
          {{ statusText }}
        </view>
        <text v-if="order.isException" class="oc-flag oc-flag--abnormal">异常</text>
        <text v-if="order.isPrinted" class="oc-flag oc-flag--printed">已打印</text>
      </view>
      <text class="oc-time">{{ fromNow(order.createdAt) }}</text>
    </view>

    <view class="oc-meta">
      <text class="oc-no">单号：{{ order.orderNo }}</text>
      <text v-if="order.deliveryType === 2" class="oc-tag-pre">预订单 {{ deliveryTimeText }}</text>
    </view>

    <view class="oc-items">
      <view
        v-for="it in order.items.slice(0, 2)"
        :key="`${it.productId}-${it.skuId}`"
        class="oc-item"
      >
        <text class="oc-item__name">{{ it.productName }}</text>
        <text class="oc-item__qty">×{{ it.qty }}</text>
        <text class="oc-item__price">{{ formatAmount(it.subtotal) }}</text>
      </view>
      <text v-if="order.items.length > 2" class="oc-item__more">
        共 {{ totalQty }} 件，更多商品请查看详情
      </text>
    </view>

    <view class="oc-summary row-between">
      <text>{{ order.receiverAddress }}</text>
      <text class="oc-summary__amount">{{ formatAmount(order.payAmount) }}</text>
    </view>

    <view class="oc-actions" @click.stop>
      <slot name="actions" :order="order" />
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { MerchantOrder } from '@/types/biz'
  import { ORDER_STATUS_TEXT } from '@/types/biz'
  import { formatAmount, fromNow, formatTime } from '@/utils/format'

  /**
   * 订单卡片（订单列表 / 历史订单复用）
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.18)
   */
  interface Props {
    order: MerchantOrder
  }

  const props = defineProps<Props>()

  const emit = defineEmits<{
    (e: 'click', order: MerchantOrder): void
  }>()

  const totalQty = computed<number>(() => props.order.items.reduce((sum, it) => sum + it.qty, 0))

  const statusText = computed<string>(() => {
    if (props.order.isException) return '异常'
    return ORDER_STATUS_TEXT[props.order.status] ?? '-'
  })

  const statusKey = computed<string>(() => {
    if (props.order.isException) return 'abnormal'
    switch (props.order.status) {
      case 10:
        return 'pending'
      case 20:
        return 'cooking'
      case 30:
      case 40:
        return 'delivering'
      case 50:
      case 55:
        return 'finished'
      case 60:
        return 'canceled'
      case 70:
        return 'aftersale'
      default:
        return 'default'
    }
  })

  const deliveryTimeText = computed<string>(() =>
    props.order.deliveryTime ? formatTime(props.order.deliveryTime, 'MM-DD HH:mm') : '预约'
  )

  function onClick() {
    emit('click', props.order)
  }
</script>

<style lang="scss" scoped>
  .oc {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .oc-header {
    margin-bottom: 12rpx;
  }

  .oc-status {
    padding: 4rpx 16rpx;
    margin-right: 16rpx;
    font-size: 22rpx;
    color: #fff;
    border-radius: 999rpx;

    &--pending {
      background: $order-pending;
    }

    &--cooking {
      background: $order-cooking;
    }

    &--delivering {
      background: $order-delivering;
    }

    &--finished {
      background: $order-finished;
    }

    &--canceled {
      background: $order-canceled;
    }

    &--aftersale {
      background: $uni-color-warning;
    }

    &--abnormal {
      background: $order-abnormal;
    }

    &--default {
      background: $uni-color-info;
    }
  }

  .oc-flag {
    padding: 2rpx 8rpx;
    margin-right: 8rpx;
    font-size: 20rpx;
    border-radius: 6rpx;

    &--abnormal {
      color: $uni-color-error;
      background: rgb(255 77 79 / 12%);
    }

    &--printed {
      color: $uni-color-success;
      background: rgb(82 196 26 / 12%);
    }
  }

  .oc-time {
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .oc-meta {
    display: flex;
    align-items: center;
    margin-bottom: 12rpx;
  }

  .oc-no {
    margin-right: 16rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .oc-tag-pre {
    padding: 2rpx 8rpx;
    font-size: 20rpx;
    color: $uni-color-warning;
    background: rgb(250 140 22 / 12%);
    border-radius: 4rpx;
  }

  .oc-items {
    padding: 16rpx 0;
    margin-bottom: 12rpx;
    border-top: 1rpx dashed $uni-border-color;
    border-bottom: 1rpx dashed $uni-border-color;
  }

  .oc-item {
    display: flex;
    align-items: center;
    margin-bottom: 4rpx;
    font-size: 24rpx;

    &__name {
      flex: 1;
      overflow: hidden;
      color: $uni-text-color;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__qty {
      width: 80rpx;
      color: $uni-text-color-grey;
      text-align: center;
    }

    &__price {
      width: 120rpx;
      color: $uni-text-color;
      text-align: right;
    }

    &__more {
      display: block;
      margin-top: 8rpx;
      font-size: 20rpx;
      color: $uni-text-color-placeholder;
    }
  }

  .oc-summary {
    margin-bottom: 12rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;

    &__amount {
      font-size: 30rpx;
      font-weight: 600;
      color: $uni-color-error;
    }
  }

  .oc-actions {
    display: flex;
    gap: 12rpx;
    justify-content: flex-end;
    padding-top: 16rpx;
    border-top: 1rpx solid $uni-border-color;
  }
</style>
