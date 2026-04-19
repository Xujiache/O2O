<template>
  <view class="page page-fin">
    <!-- 余额卡 -->
    <view class="fin-balance">
      <text class="fin-balance__label">可提现余额（元）</text>
      <text class="fin-balance__value">{{ formatAmount(overview.available, '') }}</text>
      <view class="fin-balance__sub">
        <text>冻结：{{ formatAmount(overview.frozen, '') }}</text>
      </view>
      <BizBtn
        class="fin-balance__btn"
        type="primary"
        text="申请提现"
        perm="finance:withdraw"
        @click="goWithdraw"
      />
    </view>

    <!-- 今日 KPI -->
    <view class="fin-kpi">
      <view class="fin-kpi__cell">
        <text class="fin-kpi__num">{{ formatAmount(overview.todayIncome, '') }}</text>
        <text class="fin-kpi__label">今日营收</text>
      </view>
      <view class="fin-kpi__cell">
        <text class="fin-kpi__num">{{ overview.todayOrderCount }}</text>
        <text class="fin-kpi__label">今日订单</text>
      </view>
      <view class="fin-kpi__cell">
        <text class="fin-kpi__num">{{ formatAmount(overview.monthIncome, '') }}</text>
        <text class="fin-kpi__label">本月累计</text>
      </view>
    </view>

    <!-- 入口列表 -->
    <view class="fin-menu">
      <view class="fin-menu__item" @click="goBillList">
        <text class="fin-menu__icon">📊</text>
        <text class="fin-menu__text">账单明细</text>
        <text class="fin-menu__arrow">›</text>
      </view>
      <view class="fin-menu__item" @click="goWithdrawRecord">
        <text class="fin-menu__icon">💸</text>
        <text class="fin-menu__text">提现记录</text>
        <text class="fin-menu__arrow">›</text>
      </view>
      <view class="fin-menu__item" @click="goBankCard">
        <text class="fin-menu__icon">💳</text>
        <text class="fin-menu__text">银行卡管理</text>
        <text class="fin-menu__arrow">›</text>
      </view>
      <view class="fin-menu__item" @click="goInvoice">
        <text class="fin-menu__icon">🧾</text>
        <text class="fin-menu__text">发票管理</text>
        <text class="fin-menu__arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, onMounted } from 'vue'
  import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
  import { useShopStore } from '@/store'
  import { getOverview } from '@/api/finance'
  import { mockEnabled, mockFinance, delay } from '@/api/_mock'
  import { formatAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 财务结算（tabBar 4 / T6.29）
   *
   * 概览卡 + 今日 KPI + 4 个二级入口
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()

  const overview = reactive({
    available: '0.00',
    frozen: '0.00',
    todayIncome: '0.00',
    todayOrderCount: 0,
    monthIncome: '0.00',
    totalPlatformFee: '0.00'
  })

  onMounted(async () => {
    track(TRACK.VIEW_FINANCE)
    await loadOverview()
  })

  onShow(async () => {
    await loadOverview()
  })

  onPullDownRefresh(async () => {
    await loadOverview()
    uni.stopPullDownRefresh()
  })

  async function loadOverview() {
    try {
      const r = mockEnabled()
        ? await delay(mockFinance)
        : await getOverview(shopStore.currentShopId)
      Object.assign(overview, r)
    } catch (e) {
      logger.warn('fin.overview.fail', { e: String(e) })
    }
  }

  function goBillList() {
    uni.navigateTo({ url: '/pages-finance/bill-list' })
  }
  function goWithdraw() {
    uni.navigateTo({ url: '/pages-finance/withdraw' })
  }
  function goWithdrawRecord() {
    uni.navigateTo({ url: '/pages-finance/withdraw-record' })
  }
  function goBankCard() {
    uni.navigateTo({ url: '/pages-finance/bank-card' })
  }
  function goInvoice() {
    uni.navigateTo({ url: '/pages-finance/invoice-list' })
  }
</script>

<style lang="scss" scoped>
  .page-fin {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .fin-balance {
    padding: 32rpx;
    margin-bottom: 24rpx;
    color: #fff;
    background: linear-gradient(135deg, $uni-color-primary 0%, #6db3ff 100%);
    border-radius: 16rpx;

    &__label {
      display: block;
      font-size: 24rpx;
      opacity: 0.85;
    }

    &__value {
      display: block;
      margin-top: 8rpx;
      font-size: 60rpx;
      font-weight: 700;
    }

    &__sub {
      margin-top: 8rpx;
      font-size: 22rpx;
      opacity: 0.85;
    }

    &__btn {
      margin-top: 24rpx;
    }
  }

  .fin-kpi {
    display: flex;
    padding: 24rpx 0;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;

    &__cell {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
    }

    &__num {
      font-size: 32rpx;
      font-weight: 600;
      color: $uni-color-primary;
    }

    &__label {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .fin-menu {
    background: #fff;
    border-radius: 16rpx;

    &__item {
      display: flex;
      align-items: center;
      padding: 24rpx 32rpx;
      border-bottom: 1rpx solid $uni-border-color;

      &:last-child {
        border-bottom: none;
      }
    }

    &__icon {
      width: 48rpx;
      margin-right: 16rpx;
      font-size: 32rpx;
    }

    &__text {
      flex: 1;
      font-size: 28rpx;
      color: $uni-text-color;
    }

    &__arrow {
      font-size: 32rpx;
      color: $uni-text-color-placeholder;
    }
  }
</style>
