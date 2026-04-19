<template>
  <view class="page page-workbench">
    <!-- 顶部商户卡 -->
    <view class="wb-header">
      <view class="row-between">
        <BizShopSwitcher />
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

    <!-- KPI 卡 -->
    <view class="wb-kpi">
      <view class="wb-kpi__cell">
        <text class="wb-kpi__num">{{ kpi.todayOrderCount }}</text>
        <text class="wb-kpi__label">今日订单</text>
      </view>
      <view class="wb-kpi__cell">
        <text class="wb-kpi__num">{{ formatAmount(kpi.todayIncome, '') }}</text>
        <text class="wb-kpi__label">今日营收 (元)</text>
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

    <!-- 异常警示 -->
    <view v-if="kpi.abnormalCount > 0" class="wb-alert" @click="goOrder">
      <text>⚠ 当前 {{ kpi.abnormalCount }} 单异常待处理，点击查看</text>
    </view>

    <!-- 快捷入口 -->
    <view class="wb-section">
      <text class="wb-section__title">快捷操作</text>
      <view class="wb-quick">
        <view class="wb-quick__item" @click="goShopEdit">
          <text class="wb-quick__icon">🏪</text>
          <text>店铺信息</text>
        </view>
        <view class="wb-quick__item" @click="goBusinessHour">
          <text class="wb-quick__icon">🕒</text>
          <text>营业时间</text>
        </view>
        <view class="wb-quick__item" @click="goDeliveryArea">
          <text class="wb-quick__icon">📍</text>
          <text>配送范围</text>
        </view>
        <view class="wb-quick__item" @click="goReview">
          <text class="wb-quick__icon">💬</text>
          <text>评价管理</text>
        </view>
      </view>
    </view>

    <!-- 评分曲线 -->
    <view class="wb-section">
      <view class="row-between">
        <text class="wb-section__title">最近 30 天评分</text>
        <text class="wb-section__more" @click="loadRating">刷新</text>
      </view>
      <BizStatChart
        :data="ratingPoints"
        :loading="ratingLoading"
        emptyText="暂无评分数据"
        :y-min="0"
        :y-max="5"
      />
    </view>

    <!-- 营业状态切换 -->
    <view class="wb-section wb-section--card">
      <view class="row-between">
        <view>
          <text class="wb-section__title">营业状态</text>
          <text class="wb-section__sub">关闭后用户将不能下单</text>
        </view>
        <switch :checked="shopStore.isOpen" color="#2F80ED" @change="onToggleOpen" />
      </view>
      <BizBtn
        v-if="!shopStore.isOpen"
        type="warning"
        text="临时歇业"
        block
        style="margin-top: 16rpx"
        @click="onTempClose"
      />
    </view>

    <!-- 自动接单 -->
    <view class="wb-section wb-section--card">
      <view class="row-between">
        <view>
          <text class="wb-section__title">自动接单</text>
          <text class="wb-section__sub">开启后新订单 5 秒倒计时自动接单</text>
        </view>
        <switch :checked="shopStore.autoAccept" color="#2F80ED" @change="onToggleAutoAccept" />
      </view>
    </view>

    <!-- 临时歇业弹层 -->
    <BizDialog
      v-model:show="tempCloseVisible"
      title="临时歇业"
      content="选择歇业时长，到期自动恢复营业"
      :show-cancel="true"
      confirm-text="确认歇业"
      @confirm="onConfirmTempClose"
    >
      <view class="temp-close">
        <view
          v-for="opt in tempCloseOptions"
          :key="opt.label"
          class="temp-close__opt"
          :class="{ 'temp-close__opt--active': tempCloseHours === opt.hours }"
          @click="tempCloseHours = opt.hours"
        >
          {{ opt.label }}
        </view>
      </view>
    </BizDialog>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, onMounted } from 'vue'
  import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
  import { useAuthStore, useShopStore } from '@/store'
  import { mockEnabled, mockShops, delay } from '@/api/_mock'
  import {
    listMyShops,
    getWorkbenchKpi,
    getRatingTrend,
    toggleShopOpen,
    toggleAutoAccept
  } from '@/api/shop'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import { formatAmount } from '@/utils/format'

  /**
   * 工作台首页（tabBar 1）
   *
   * 本期（S2）实现：
   *   - 真实 KPI 卡（今日订单/营收/待处理/评分）
   *   - 评分曲线（最近 30 天）
   *   - 店铺切换器（BizShopSwitcher）
   *   - 营业状态切换（带二次确认）+ 临时歇业（多档时长）
   *   - 自动接单切换
   *   - 4 个快捷入口（店铺信息 / 营业时间 / 配送范围 / 评价管理）
   *   - 异常订单警示条（直跳订单页）
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.10-T6.11)
   */
  const authStore = useAuthStore()
  const shopStore = useShopStore()

  const kpi = reactive({
    todayOrderCount: 0,
    todayIncome: '0.00',
    pendingOrderCount: 0,
    scoreAvg: '0.0',
    monthOrderCount: 0,
    monthIncome: '0.00',
    abnormalCount: 0
  })

  const ratingPoints = ref<{ label: string; value: number }[]>([])
  const ratingLoading = ref<boolean>(false)

  /** 临时歇业弹层 */
  const tempCloseVisible = ref<boolean>(false)
  const tempCloseHours = ref<number>(2)
  const tempCloseOptions = [
    { label: '1 小时', hours: 1 },
    { label: '2 小时', hours: 2 },
    { label: '4 小时', hours: 4 },
    { label: '至明日 9 点', hours: -1 }
  ]

  onMounted(async () => {
    track(TRACK.VIEW_WORKBENCH)
    await loadShops()
    await loadKpi()
    await loadRating()
  })

  onShow(async () => {
    if (shopStore.currentShopId) {
      await loadKpi()
    }
  })

  onPullDownRefresh(async () => {
    await loadShops()
    await loadKpi()
    await loadRating()
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

  async function loadKpi() {
    if (!shopStore.currentShopId) return
    try {
      if (mockEnabled()) {
        const r = await delay({
          todayOrderCount: 12,
          todayIncome: '786.30',
          pendingOrderCount: 3,
          scoreAvg: '4.8',
          monthOrderCount: 320,
          monthIncome: '23456.80',
          abnormalCount: 0
        })
        Object.assign(kpi, r)
      } else {
        const r = await getWorkbenchKpi(shopStore.currentShopId)
        Object.assign(kpi, r)
      }
    } catch (e) {
      logger.warn('workbench.loadKpi.fail', { e: String(e) })
    }
  }

  async function loadRating() {
    if (!shopStore.currentShopId) return
    ratingLoading.value = true
    try {
      const list = mockEnabled()
        ? await delay(genMockRating())
        : await getRatingTrend(shopStore.currentShopId, 30)
      ratingPoints.value = list.map((p) => ({ label: p.date.slice(5), value: p.score }))
    } catch (e) {
      logger.warn('workbench.loadRating.fail', { e: String(e) })
    } finally {
      ratingLoading.value = false
    }
  }

  function genMockRating() {
    const r: { date: string; score: number }[] = []
    const today = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000)
      r.push({
        date: d.toISOString().slice(0, 10),
        score: 4 + Math.random() * 1
      })
    }
    return r
  }

  function onToggleOpen(e: unknown) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    if (!shopStore.currentShopId) {
      uni.showToast({ title: '请先选择店铺', icon: 'none' })
      return
    }
    uni.showModal({
      title: v ? '开启营业' : '关闭营业',
      content: v ? '开启后用户可下单，确认开启吗？' : '关闭后用户将无法下单，确认关闭吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          if (!mockEnabled()) {
            await toggleShopOpen(shopStore.currentShopId, { isOpen: v ? 1 : 0 })
          }
          shopStore.toggleOpen(v ? 1 : 0)
          track(TRACK.TOGGLE_SHOP_OPEN, { isOpen: v ? 1 : 0 })
          uni.showToast({ title: v ? '已开启营业' : '已歇业', icon: 'success' })
        } catch (err) {
          logger.warn('workbench.toggleOpen.fail', { e: String(err) })
        }
      }
    })
  }

  async function onToggleAutoAccept(e: unknown) {
    const v = (e as { detail?: { value?: boolean } })?.detail?.value ?? false
    try {
      if (!mockEnabled()) {
        await toggleAutoAccept(shopStore.currentShopId, v ? 1 : 0)
      }
      shopStore.toggleAutoAccept(v ? 1 : 0)
      track(v ? TRACK.CLICK_AUTO_ACCEPT_ON : TRACK.CLICK_AUTO_ACCEPT_OFF)
      uni.showToast({ title: v ? '已开启自动接单' : '已关闭自动接单', icon: 'success' })
    } catch (err) {
      logger.warn('workbench.toggleAutoAccept.fail', { e: String(err) })
    }
  }

  function onTempClose() {
    tempCloseVisible.value = true
  }

  async function onConfirmTempClose() {
    try {
      const tempCloseUntil =
        tempCloseHours.value === -1
          ? nextDay9amISO()
          : new Date(Date.now() + tempCloseHours.value * 3600 * 1000).toISOString()
      if (!mockEnabled()) {
        await toggleShopOpen(shopStore.currentShopId, {
          isOpen: 2,
          tempCloseReason: '临时歇业',
          tempCloseUntil
        })
      }
      shopStore.toggleOpen(2)
      shopStore.updateCurrentShop({ tempCloseUntil, tempCloseReason: '临时歇业' })
      uni.showToast({ title: '已临时歇业', icon: 'success' })
    } catch (err) {
      logger.warn('workbench.tempClose.fail', { e: String(err) })
    }
  }

  function nextDay9amISO(): string {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d.toISOString()
  }

  function goShopEdit() {
    uni.navigateTo({ url: '/pages-shop/edit' })
  }
  function goBusinessHour() {
    uni.navigateTo({ url: '/pages-shop/business-hour' })
  }
  function goDeliveryArea() {
    uni.navigateTo({ url: '/pages-shop/delivery-area' })
  }
  function goReview() {
    uni.navigateTo({ url: '/pages-shop/review-list' })
  }
  function goOrder() {
    uni.switchTab({ url: '/pages/order/index' })
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

  .wb-shop__status {
    padding: 4rpx 16rpx;
    font-size: 22rpx;
    background: rgb(255 255 255 / 22%);
    border-radius: 999rpx;

    &--open {
      background: rgb(82 196 26 / 30%);
    }
  }

  .wb-greet {
    display: block;
    margin-top: 16rpx;
    font-size: 24rpx;
    opacity: 0.85;
  }

  .wb-alert {
    padding: 16rpx 24rpx;
    margin-bottom: 24rpx;
    font-size: 24rpx;
    color: $uni-color-error;
    background: rgb(255 77 79 / 8%);
    border-left: 6rpx solid $uni-color-error;
    border-radius: 8rpx;
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

    &__more {
      font-size: 22rpx;
      color: $uni-color-primary;
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

  .temp-close {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16rpx;
    padding: 16rpx 0;

    &__opt {
      padding: 24rpx;
      font-size: 26rpx;
      color: $uni-text-color;
      text-align: center;
      background: $uni-bg-color-grey;
      border: 2rpx solid transparent;
      border-radius: 12rpx;

      &--active {
        color: $uni-color-primary;
        background: $uni-color-primary-light;
        border-color: $uni-color-primary;
      }
    }
  }
</style>
