<template>
  <view class="page">
    <BizEmpty v-if="wallet.withdrawHistory.length === 0" title="暂无提现记录" scene="wallet" />
    <view v-else>
      <view v-for="w in wallet.withdrawHistory" :key="w.id" class="row">
        <view class="row__col">
          <text class="row__name">提现至 {{ w.cardName }}</text>
          <text class="row__time">{{ formatTime(w.createdAt) }}</text>
          <text v-if="w.rejectReason" class="row__reject">{{ w.rejectReason }}</text>
        </view>
        <view class="row__amt">
          <text class="row__amount">{{ formatAmount(w.amount) }}</text>
          <text class="row__status" :class="`row__status--${w.status}`">{{
            statusText(w.status)
          }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad } from '@dcloudio/uni-app'
  import { useWalletStore } from '@/store'
  import { formatAmount, formatTime } from '@/utils/format'

  /**
   * 提现记录列表
   * @author 单 Agent V2.0 (P7 骑手端 / T7.34)
   */
  const wallet = useWalletStore()

  onLoad(async () => {
    await wallet.loadWithdrawHistory(true)
  })

  function statusText(s: 1 | 2 | 3 | 4 | 5): string {
    return ({ 1: '待审核', 2: '已通过', 3: '已打款', 4: '已拒绝', 5: '失败' } as const)[s] ?? '-'
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 16rpx;
    background: $uni-bg-color-grey;
  }

  .row {
    display: flex;
    align-items: center;
    padding: 24rpx;
    margin-bottom: 12rpx;
    background: #fff;
    border-radius: 12rpx;

    &__col {
      flex: 1;
    }

    &__name {
      display: block;
      font-size: 26rpx;
    }

    &__time {
      display: block;
      margin-top: 4rpx;
      font-size: 20rpx;
      color: $uni-text-color-grey;
    }

    &__reject {
      display: block;
      margin-top: 4rpx;
      font-size: 20rpx;
      color: $uni-color-error;
    }

    &__amt {
      text-align: right;
    }

    &__amount {
      display: block;
      font-size: 30rpx;
      font-weight: 600;
    }

    &__status {
      display: block;
      margin-top: 4rpx;
      font-size: 22rpx;

      &--1 {
        color: $uni-color-warning;
      }

      &--2,
      &--3 {
        color: $uni-color-primary;
      }

      &--4,
      &--5 {
        color: $uni-color-error;
      }
    }
  }
</style>
