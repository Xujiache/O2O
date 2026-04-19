<template>
  <view class="wallet">
    <view class="overview">
      <view class="overview__label">可提现余额</view>
      <view class="overview__amount">{{ formatAmount(wallet.overview.available) }}</view>
      <view class="overview__sub">
        冻结 {{ formatAmount(wallet.overview.frozen) }} · 月累计
        {{ formatAmount(wallet.overview.monthIncome) }}
      </view>
      <view class="overview__actions">
        <button class="action action--primary" @click="goWithdraw">提现</button>
        <button class="action" @click="goWithdrawRecord">提现记录</button>
        <button class="action" @click="goBankCard">银行卡</button>
      </view>
    </view>

    <view class="card today">
      <view class="card__title">今日</view>
      <view class="today__row">
        <view class="today__cell">
          <view class="today__num">{{ formatAmount(wallet.overview.todayIncome) }}</view>
          <view class="today__label">收入</view>
        </view>
        <view class="today__cell">
          <view class="today__num">{{ wallet.overview.todayOrderCount }}</view>
          <view class="today__label">单数</view>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="card__title-row">
        <text class="card__title">账单流水</text>
        <text class="card__more" @click="goBillList">查看全部 ›</text>
      </view>
      <BizLoading v-if="wallet.billLoading && wallet.billList.length === 0" />
      <BizEmpty v-else-if="wallet.billList.length === 0" title="暂无账单" scene="wallet" />
      <view v-else>
        <view v-for="b in topBills" :key="b.id" class="bill">
          <view class="bill__col">
            <text class="bill__name">{{ b.remark }}</text>
            <text class="bill__time">{{ formatTime(b.createdAt) }}</text>
          </view>
          <text class="bill__amount" :class="`bill__amount--${b.flowDirection}`">
            {{ b.flowDirection === 1 ? '+' : '-' }}{{ formatAmount(b.amount) }}
          </text>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="card__title-row">
        <text class="card__title">薪资规则</text>
        <text class="card__more" @click="goSalaryRule">查看 ›</text>
      </view>
      <view class="salary-tip">{{ salaryRuleSummary }}</view>
    </view>

    <BizDispatchModal />
  </view>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app'
  import { useWalletStore } from '@/store'
  import { fetchSalaryRule } from '@/api/wallet'
  import { mockResolve } from '@/api/_mock'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 钱包概览主页：余额 + 今日 + 账单预览 + 薪资规则简介
   *   T7.32（概览）
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const wallet = useWalletStore()
  const salaryRuleSummary = ref('基础配送费 6 元/单，2km 内不加价；高峰 1.5 倍；恶劣天气补贴 2 元')

  const topBills = computed(() => wallet.billList.slice(0, 5))

  onLoad(() => {
    track(TRACK.VIEW_WALLET)
  })

  onShow(async () => {
    await Promise.all([
      wallet.refresh().catch(() => {
        wallet.overview = { ...mockResolve.walletOverview }
      }),
      wallet.loadBills(true).catch(() => {
        wallet.billList = mockResolve.bills
      })
    ])
    try {
      const rule = await fetchSalaryRule()
      salaryRuleSummary.value = rule.text
    } catch (e) {
      logger.warn('wallet.salaryRule.fail', { e: String(e) })
    }
  })

  onPullDownRefresh(async () => {
    await Promise.all([wallet.refresh(), wallet.loadBills(true)])
    uni.stopPullDownRefresh()
  })

  function goWithdraw() {
    uni.navigateTo({ url: '/pages-wallet/withdraw' })
  }

  function goWithdrawRecord() {
    uni.navigateTo({ url: '/pages-wallet/withdraw-record' })
  }

  function goBankCard() {
    uni.navigateTo({ url: '/pages-wallet/bank-card' })
  }

  function goBillList() {
    uni.navigateTo({ url: '/pages-wallet/bill-list' })
  }

  function goSalaryRule() {
    uni.navigateTo({ url: '/pages-wallet/salary-rule' })
  }
</script>

<style lang="scss" scoped>
  .wallet {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .overview {
    padding: 32rpx;
    margin-bottom: 24rpx;
    color: #fff;
    background: linear-gradient(135deg, $uni-color-primary 0%, $uni-color-primary-dark 100%);
    border-radius: 16rpx;

    &__label {
      font-size: 24rpx;
      opacity: 0.85;
    }

    &__amount {
      margin: 8rpx 0;
      font-size: 64rpx;
      font-weight: 700;
    }

    &__sub {
      font-size: 22rpx;
      opacity: 0.85;
    }

    &__actions {
      display: flex;
      gap: 16rpx;
      margin-top: 24rpx;
    }
  }

  .action {
    flex: 1;
    height: 72rpx;
    font-size: 24rpx;
    line-height: 72rpx;
    color: $uni-color-primary;
    background: #fff;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }

    &--primary {
      color: #fff;
      background: rgb(255 255 255 / 22%);
      border: 2rpx solid #fff;
    }
  }

  .card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      font-size: 28rpx;
      font-weight: 600;
    }

    &__title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16rpx;
    }

    &__more {
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .today__row {
    display: flex;
    gap: 16rpx;
  }

  .today__cell {
    flex: 1;
    text-align: center;
  }

  .today__num {
    font-size: 32rpx;
    font-weight: 600;
    color: $uni-color-primary;
  }

  .today__label {
    margin-top: 4rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .bill {
    display: flex;
    align-items: center;
    padding: 16rpx 0;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }

    &__col {
      flex: 1;
    }

    &__name {
      display: block;
      font-size: 26rpx;
      color: $uni-text-color;
    }

    &__time {
      display: block;
      margin-top: 4rpx;
      font-size: 20rpx;
      color: $uni-text-color-grey;
    }

    &__amount {
      font-size: 28rpx;
      font-weight: 600;

      &--1 {
        color: $uni-color-primary;
      }

      &--2 {
        color: $uni-color-error;
      }
    }
  }

  .salary-tip {
    font-size: 24rpx;
    line-height: 1.6;
    color: $uni-text-color-grey;
  }
</style>
