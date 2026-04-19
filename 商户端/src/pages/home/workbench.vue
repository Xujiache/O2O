<template>
  <view class="page page-workbench">
    <!-- 顶部商户信息 -->
    <view class="wb-header">
      <view class="wb-shop">
        <text class="wb-shop__name">{{ shopStore.currentShop?.name || '请选择店铺' }}</text>
        <view
          class="wb-shop__status"
          :class="{
            'wb-shop__status--open': shopStore.isOpen,
            'wb-shop__status--close': !shopStore.isOpen
          }"
        >
          {{ shopStore.isOpen ? '营业中' : '已歇业' }}
        </view>
      </view>
      <text class="wb-greet">您好，{{ authStore.profile?.contactName || '商户' }}</text>
    </view>

    <!-- KPI 卡片（S2 完整对接，本期占位） -->
    <view class="wb-kpi">
      <view class="wb-kpi__cell">
        <text class="wb-kpi__num">{{ kpi.todayOrderCount }}</text>
        <text class="wb-kpi__label">今日订单</text>
      </view>
      <view class="wb-kpi__cell">
        <text class="wb-kpi__num">¥{{ kpi.todayIncome }}</text>
        <text class="wb-kpi__label">今日营收</text>
      </view>
      <view class="wb-kpi__cell">
        <text class="wb-kpi__num">{{ kpi.pendingOrderCount }}</text>
        <text class="wb-kpi__label">待处理</text>
      </view>
      <view class="wb-kpi__cell">
        <text class="wb-kpi__num">{{ kpi.scoreAvg }}</text>
        <text class="wb-kpi__label">店铺评分</text>
      </view>
    </view>

    <!-- 快捷入口（S2 实现） -->
    <view class="wb-section">
      <text class="wb-section__title">快捷操作</text>
      <view class="wb-quick">
        <view class="wb-quick__item" @click="goShop">
          <text class="wb-quick__icon">🏪</text>
          <text>店铺管理</text>
        </view>
        <view class="wb-quick__item" @click="goOrder">
          <text class="wb-quick__icon">📋</text>
          <text>订单管理</text>
        </view>
        <view class="wb-quick__item" @click="goProduct">
          <text class="wb-quick__icon">🍱</text>
          <text>商品管理</text>
        </view>
        <view class="wb-quick__item" @click="goFinance">
          <text class="wb-quick__icon">💰</text>
          <text>财务结算</text>
        </view>
      </view>
    </view>

    <!-- 营业状态切换（S2 完整对接） -->
    <view class="wb-section wb-section--card">
      <view class="row-between">
        <view>
          <text class="wb-section__title">营业状态</text>
          <text class="wb-section__sub">关闭后用户将不能下单</text>
        </view>
        <switch :checked="shopStore.isOpen" color="#2F80ED" @change="onToggleOpen" />
      </view>
    </view>

    <!-- 自动接单 -->
    <view class="wb-section wb-section--card">
      <view class="row-between">
        <view>
          <text class="wb-section__title">自动接单</text>
          <text class="wb-section__sub">开启后新订单自动接单（5 秒倒计时）</text>
        </view>
        <switch :checked="shopStore.autoAccept" color="#2F80ED" @change="onToggleAutoAccept" />
      </view>
    </view>

    <view class="wb-tip">完整 KPI / 评分曲线 / 快捷入口将在 Sprint 2 上线</view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, onMounted } from 'vue'
  import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
  import { useAuthStore, useShopStore } from '@/store'
  import { mockEnabled, mockShops, delay } from '@/api/_mock'
  import { listMyShops } from '@/api/shop'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 工作台首页（tabBar）
   *
   * 本期（S1）实现：
   *   - 商户信息展示
   *   - KPI 占位（mock 数据）
   *   - 快捷入口（占位跳转 tabBar）
   *   - 营业状态切换 / 自动接单切换（本地态）
   *
   * S2 完成：真实 KPI / 评分曲线 / 真实店铺切换
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.10-T6.11)
   */
  const authStore = useAuthStore()
  const shopStore = useShopStore()

  const kpi = reactive({
    todayOrderCount: 0,
    todayIncome: '0.00',
    pendingOrderCount: 0,
    scoreAvg: '0.0'
  })

  onMounted(async () => {
    track(TRACK.VIEW_WORKBENCH)
    await loadShops()
  })

  onShow(() => {
    /* 返回 tabBar 时刷新 KPI */
  })

  onPullDownRefresh(async () => {
    await loadShops()
    uni.stopPullDownRefresh()
  })

  async function loadShops() {
    try {
      const list = mockEnabled() ? await delay(mockShops) : await listMyShops()
      shopStore.setShopList(list)
    } catch (e) {
      logger.warn('workbench.loadShops.fail', { e: String(e) })
    }
  }

  /** uni-app switch 事件兼容 vue-tsc：参数声明为 unknown 再断言 */
  function onToggleOpen(e: unknown) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    shopStore.toggleOpen(v ? 1 : 0)
    uni.showToast({ title: v ? '已开启营业' : '已歇业', icon: 'success' })
  }

  function onToggleAutoAccept(e: unknown) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    shopStore.toggleAutoAccept(v ? 1 : 0)
    uni.showToast({ title: v ? '已开启自动接单' : '已关闭自动接单', icon: 'success' })
  }

  function goShop() {
    /* S2 实现店铺管理 tabBar */
    uni.showToast({ title: 'S2 上线', icon: 'none' })
  }
  function goOrder() {
    uni.switchTab({ url: '/pages/order/index' })
  }
  function goProduct() {
    uni.switchTab({ url: '/pages/product/index' })
  }
  function goFinance() {
    uni.switchTab({ url: '/pages/finance/index' })
  }
</script>

<style lang="scss" scoped>
  .page-workbench {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .wb-header {
    padding: 32rpx;
    margin-bottom: 24rpx;
    color: #fff;
    background: linear-gradient(135deg, $uni-color-primary 0%, #6db3ff 100%);
    border-radius: 16rpx;
  }

  .wb-shop {
    display: flex;
    align-items: center;
    justify-content: space-between;

    &__name {
      font-size: 32rpx;
      font-weight: 600;
    }

    &__status {
      padding: 4rpx 16rpx;
      font-size: 22rpx;
      background: rgb(255 255 255 / 22%);
      border-radius: 999rpx;

      &--open {
        background: rgb(82 196 26 / 30%);
      }

      &--close {
        background: rgb(255 255 255 / 22%);
      }
    }
  }

  .wb-greet {
    display: block;
    margin-top: 16rpx;
    font-size: 24rpx;
    opacity: 0.85;
  }

  .wb-kpi {
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
      font-size: 36rpx;
      font-weight: 600;
      color: $uni-color-primary;
    }

    &__label {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .wb-section {
    padding: 24rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;

    &--card {
      padding: 24rpx 32rpx;
    }

    &__title {
      display: block;
      font-size: 28rpx;
      font-weight: 600;
      color: $uni-text-color;
    }

    &__sub {
      display: block;
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .wb-quick {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24rpx;
    margin-top: 24rpx;

    &__item {
      display: flex;
      flex-direction: column;
      align-items: center;
      font-size: 22rpx;
      color: $uni-text-color;
    }

    &__icon {
      margin-bottom: 8rpx;
      font-size: 48rpx;
      line-height: 1;
    }
  }

  .wb-tip {
    padding: 24rpx;
    font-size: 22rpx;
    color: $uni-text-color-placeholder;
    text-align: center;
  }
</style>
