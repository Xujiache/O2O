<template>
  <view class="page">
    <BizLoading v-if="wallet.billLoading && wallet.billList.length === 0" />
    <BizEmpty v-else-if="wallet.billList.length === 0" title="暂无账单" scene="wallet" />
    <scroll-view v-else scroll-y class="list" @scrolltolower="onLoadMore">
      <view v-for="b in wallet.billList" :key="b.id" class="bill">
        <view class="bill__col">
          <text class="bill__name">{{ b.remark }}</text>
          <text class="bill__time">{{ formatTime(b.createdAt) }}</text>
          <text v-if="b.bizNo" class="bill__no">{{ b.bizNo }}</text>
        </view>
        <view class="bill__amt">
          <text class="bill__amount" :class="`bill__amount--${b.flowDirection}`">
            {{ b.flowDirection === 1 ? '+' : '-' }}{{ formatAmount(b.amount) }}
          </text>
          <text class="bill__balance">余 {{ formatAmount(b.balanceAfter) }}</text>
        </view>
      </view>
      <view v-if="!wallet.billHasMore && wallet.billList.length > 0" class="footer-tip">
        已经到底啦
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
  import { useWalletStore } from '@/store'
  import { mockResolve } from '@/api/_mock'
  import { formatAmount, formatTime } from '@/utils/format'

  /**
   * 账单明细分页列表
   *   T7.33
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const wallet = useWalletStore()

  onLoad(async () => {
    await wallet.loadBills(true).catch(() => {
      wallet.billList = mockResolve.bills
    })
  })

  onPullDownRefresh(async () => {
    await wallet.loadBills(true)
    uni.stopPullDownRefresh()
  })

  function onLoadMore() {
    void wallet.loadBills()
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 16rpx;
    background: $uni-bg-color-grey;
  }

  .list {
    height: calc(100vh - 32rpx);
  }

  .bill {
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

    &__no {
      display: block;
      margin-top: 2rpx;
      font-size: 18rpx;
      color: $uni-text-color-placeholder;
    }

    &__amt {
      text-align: right;
    }

    &__amount {
      display: block;
      font-size: 30rpx;
      font-weight: 600;

      &--1 {
        color: $uni-color-primary;
      }

      &--2 {
        color: $uni-color-error;
      }
    }

    &__balance {
      display: block;
      margin-top: 4rpx;
      font-size: 20rpx;
      color: $uni-text-color-grey;
    }
  }

  .footer-tip {
    padding: 32rpx 0;
    font-size: 22rpx;
    color: $uni-text-color-placeholder;
    text-align: center;
  }
</style>
