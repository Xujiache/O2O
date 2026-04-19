<template>
  <view class="workbench">
    <view class="header">
      <view class="header__left">
        <view class="avatar">{{ avatarLabel }}</view>
        <view class="user-info">
          <view class="name">{{ user?.realName ?? '骑手' }}</view>
          <view class="meta">Lv.{{ user?.level ?? 1 }} · 信用 {{ user?.creditPoints ?? 0 }}</view>
        </view>
      </view>
      <view
        class="duty-btn"
        :class="{ 'duty-btn--on': onDuty, 'duty-btn--off': !onDuty }"
        @click="onToggleDuty"
      >
        {{ work.switching ? '切换中...' : onDuty ? '结束接单' : '开始接单' }}
      </view>
    </view>

    <view class="card today">
      <view class="card__title">今日数据</view>
      <view class="today__grid">
        <view class="today__cell">
          <view class="today__num">{{ formatAmount(work.today.income) }}</view>
          <view class="today__label">收入</view>
        </view>
        <view class="today__cell">
          <view class="today__num">{{ work.today.orderCount }}</view>
          <view class="today__label">单数</view>
        </view>
        <view class="today__cell">
          <view class="today__num">{{ work.today.onTimeRate }}</view>
          <view class="today__label">准时率</view>
        </view>
        <view class="today__cell">
          <view class="today__num">{{ work.today.goodRate }}</view>
          <view class="today__label">好评率</view>
        </view>
      </view>
    </view>

    <view class="card progress">
      <view class="card__title">
        进行中 <text class="muted">({{ inProgress.length }} 单)</text>
      </view>
      <view v-if="inProgress.length === 0" class="empty">暂无进行中订单，可前往接单大厅</view>
      <view
        v-for="o in inProgress"
        :key="o.orderNo"
        class="progress__item"
        @click="goOrderDetail(o.orderNo)"
      >
        <view class="progress__title">
          {{ orderStatusText(o.status) }} · {{ formatDistance(o.deliverDistance) }}
        </view>
        <view class="progress__sub">{{ o.deliverAddress }}</view>
      </view>
    </view>

    <view class="card shortcuts">
      <view class="card__title">快捷入口</view>
      <view class="shortcuts__row">
        <view class="shortcut" @click="goHall">
          <view class="shortcut__icon">📦</view>
          <view>接单大厅</view>
        </view>
        <view class="shortcut" @click="goOrders">
          <view class="shortcut__icon">📋</view>
          <view>我的订单</view>
        </view>
        <view class="shortcut" @click="goWallet">
          <view class="shortcut__icon">💰</view>
          <view>钱包</view>
        </view>
        <view class="shortcut" @click="goAttendance">
          <view class="shortcut__icon">🕒</view>
          <view>考勤</view>
        </view>
      </view>
    </view>

    <view
      class="emergency"
      @longpress="onEmergencyPress"
      @touchend="onEmergencyRelease"
      @touchcancel="onEmergencyRelease"
    >
      <view class="emergency__pulse" :class="{ 'emergency__pulse--active': emergencyPressing }" />
      <view class="emergency__btn">
        <view class="emergency__icon">🆘</view>
        <view class="emergency__text">长按 3 秒紧急求助</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed, onUnmounted, ref } from 'vue'
  import { onShow, onLoad } from '@dcloudio/uni-app'
  import { useAuthStore, useWorkStore, useOrderStore, useLocationStore } from '@/store'
  import { formatAmount, formatDistance } from '@/utils/format'
  import { RIDER_ORDER_STATUS_TEXT, type RiderOrderStatus } from '@/types/biz'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 工作台首页：上下班按钮、今日数据卡、进行中订单聚合、快捷入口、紧急求助
   *   T7.10 / T7.11 / T7.12
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const auth = useAuthStore()
  const work = useWorkStore()
  const orderStore = useOrderStore()
  const location = useLocationStore()

  const user = computed(() => auth.user)
  const onDuty = computed(() => auth.onDuty)
  const inProgress = computed(() => orderStore.inProgress)

  const avatarLabel = computed(() => {
    const name = user.value?.realName ?? '骑'
    return name.slice(-1)
  })

  function orderStatusText(s: RiderOrderStatus): string {
    return RIDER_ORDER_STATUS_TEXT[s] ?? '处理中'
  }

  onLoad(() => {
    track(TRACK.VIEW_WORKBENCH)
  })

  onShow(async () => {
    if (!auth.isLoggedIn) {
      uni.reLaunch({ url: '/pages/login/index' })
      return
    }
    await Promise.all([
      work.refreshToday(),
      orderStore.loadInProgress(),
      orderStore.loadTabCounts()
    ])
  })

  async function onToggleDuty() {
    if (work.switching) return
    const loc = await location.pickOnce()
    if (!loc) {
      uni.showToast({ title: '获取定位失败，请检查权限', icon: 'none' })
      return
    }
    if (auth.onDuty) {
      const ok = await work.goOffDuty({ lng: loc.lng, lat: loc.lat })
      if (ok) uni.showToast({ title: '已下班', icon: 'success' })
    } else {
      const r = await work.goOnDuty({ lng: loc.lng, lat: loc.lat })
      if (!r.ok) {
        uni.showToast({ title: r.reason ?? '上线失败', icon: 'none' })
        return
      }
      uni.showToast({ title: '已上线接单', icon: 'success' })
    }
  }

  function goHall() {
    uni.switchTab({ url: '/pages/hall/index' })
  }
  function goOrders() {
    uni.switchTab({ url: '/pages/order/index' })
  }
  function goWallet() {
    uni.switchTab({ url: '/pages/wallet/index' })
  }
  function goAttendance() {
    uni.navigateTo({ url: '/pages-attendance/checkin' })
  }
  function goOrderDetail(orderNo: string) {
    uni.navigateTo({ url: `/pages-order/detail?orderNo=${orderNo}` })
  }

  /* ====== 紧急求助：长按 3s ====== */
  const emergencyPressing = ref(false)
  let pressTimer: ReturnType<typeof setTimeout> | null = null

  function onEmergencyPress() {
    emergencyPressing.value = true
    pressTimer = setTimeout(() => {
      emergencyPressing.value = false
      uni.navigateTo({ url: '/pages-setting/emergency' })
      logger.info('workbench.emergency.long-press')
    }, 3000)
  }

  function onEmergencyRelease() {
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
    emergencyPressing.value = false
  }

  onUnmounted(() => {
    if (pressTimer) clearTimeout(pressTimer)
  })
</script>

<style lang="scss" scoped>
  .workbench {
    min-height: 100vh;
    padding: 32rpx 32rpx 200rpx;
    background: $uni-bg-color-grey;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 32rpx;
    margin-bottom: 24rpx;
    background: linear-gradient(135deg, $uni-color-primary 0%, $uni-color-primary-dark 100%);
    border-radius: 16rpx;

    &__left {
      display: flex;
      align-items: center;
      color: #fff;
    }
  }

  .avatar {
    width: 80rpx;
    height: 80rpx;
    margin-right: 16rpx;
    font-size: 36rpx;
    line-height: 80rpx;
    color: $uni-color-primary;
    text-align: center;
    background: #fff;
    border-radius: 50%;
  }

  .user-info {
    color: #fff;
  }

  .name {
    font-size: 32rpx;
    font-weight: 600;
  }

  .meta {
    margin-top: 4rpx;
    font-size: 22rpx;
    opacity: 0.9;
  }

  .duty-btn {
    min-width: 200rpx;
    height: 80rpx;
    font-size: 28rpx;
    font-weight: 600;
    line-height: 80rpx;
    color: #fff;
    text-align: center;
    border-radius: 40rpx;
    box-shadow: 0 4rpx 12rpx rgb(0 0 0 / 14%);

    &--on {
      background: $uni-color-error;
    }

    &--off {
      background: rgb(255 255 255 / 22%);
    }
  }

  .card {
    padding: 32rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 24rpx;
      font-size: 28rpx;
      font-weight: 600;
    }
  }

  .muted {
    margin-left: 8rpx;
    font-size: 22rpx;
    font-weight: 400;
    color: $uni-text-color-grey;
  }

  .today__grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16rpx;
  }

  .today__cell {
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

  .empty {
    padding: 32rpx 0;
    font-size: 24rpx;
    color: $uni-text-color-grey;
    text-align: center;
  }

  .progress__item {
    padding: 24rpx 0;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  .progress__title {
    font-size: 26rpx;
    font-weight: 500;
    color: $uni-text-color;
  }

  .progress__sub {
    margin-top: 8rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .shortcuts__row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16rpx;
  }

  .shortcut {
    font-size: 22rpx;
    color: $uni-text-color;
    text-align: center;
  }

  .shortcut__icon {
    margin-bottom: 8rpx;
    font-size: 48rpx;
  }

  .emergency {
    position: fixed;
    right: 32rpx;
    bottom: 160rpx;
    width: 140rpx;
    height: 140rpx;
  }

  .emergency__btn {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: #fff;
    background: $uni-color-error;
    border-radius: 50%;
    box-shadow: 0 8rpx 20rpx rgb(255 77 79 / 35%);
  }

  .emergency__icon {
    font-size: 48rpx;
  }

  .emergency__text {
    margin-top: 4rpx;
    font-size: 18rpx;
  }

  .emergency__pulse {
    position: absolute;
    inset: 0;
    background: rgb(255 77 79 / 35%);
    border-radius: 50%;
    opacity: 0;
    transform: scale(1);

    &--active {
      animation: pulse 1.6s ease-out infinite;
    }
  }

  @keyframes pulse {
    0% {
      opacity: 0.7;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(2.4);
    }
  }
</style>
