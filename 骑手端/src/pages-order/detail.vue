<template>
  <view class="page">
    <BizLoading v-if="!order" />
    <template v-else>
      <view class="card top">
        <view class="top__head">
          <view class="badge" :class="`badge--biz${order.businessType}`">
            {{ order.businessType === 1 ? '外卖' : '跑腿' }}
          </view>
          <view class="top__status">{{ statusText }}</view>
          <view v-if="order.isException === 1" class="badge badge--ex">异常</view>
        </view>
        <view class="top__income">{{ formatAmount(order.totalIncome) }}</view>
        <view class="top__no">订单号 {{ order.orderNo }}</view>
      </view>

      <view class="card">
        <view class="card__title">取件信息</view>
        <view class="row">
          <text class="dot dot--from">A</text>
          <view class="row__col">
            <text class="row__name">{{ order.pickupName }}</text>
            <text class="row__addr">{{ order.pickupAddress }}</text>
            <text class="row__dist"
              >距您 {{ formatDistance(order.pickupDistance) }} · {{ order.pickupContact ?? '' }}
              {{ order.pickupMobileMask ?? '' }}</text
            >
          </view>
        </view>
        <view class="action-row">
          <button class="action" @click="navTo('pickup')">导航取件</button>
          <button class="action" @click="callShop">联系商家</button>
        </view>
      </view>

      <view class="card">
        <view class="card__title">送达信息</view>
        <view class="row">
          <text class="dot dot--to">B</text>
          <view class="row__col">
            <text class="row__name">{{ order.deliverName }}</text>
            <text class="row__addr">{{ order.deliverAddress }}</text>
            <text class="row__dist"
              >配送 {{ formatDistance(order.deliverDistance) }} · {{ order.deliverContact ?? '' }}
              {{ order.deliverMobileMask ?? '' }}</text
            >
          </view>
        </view>
        <view class="action-row">
          <button class="action" @click="navTo('deliver')">导航送达</button>
          <button class="action" @click="callCustomer">联系收件人</button>
        </view>
      </view>

      <view v-if="order.remark" class="card">
        <view class="card__title">备注</view>
        <text class="remark">{{ order.remark }}</text>
      </view>

      <!-- 动态操作栏 -->
      <view class="op-bar">
        <button v-if="canTransfer" class="op-bar__ghost" @click="goTransfer">转单</button>
        <button v-if="canAbnormal" class="op-bar__ghost" @click="goAbnormal">异常</button>
        <button v-if="canPickup" class="op-bar__primary" @click="goPickup">扫码取件</button>
        <button v-if="canDeliver" class="op-bar__primary" @click="goDeliver">送达</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { onLoad, onShow } from '@dcloudio/uni-app'
  import { useOrderStore, useLocationStore } from '@/store'
  import type { RiderOrder, RiderOrderStatus } from '@/types/biz'
  import { RIDER_ORDER_STATUS_TEXT } from '@/types/biz'
  import { formatAmount, formatDistance } from '@/utils/format'
  import { showNavChoose } from '@/utils/navigator'
  import { callRelay } from '@/api/order'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import { mockResolve } from '@/api/_mock'

  /**
   * 订单详情：动态操作栏 + 取件/送达 + 联系（虚拟号码）+ 导航
   * @author 单 Agent V2.0 (P7 骑手端 / T7.18)
   */
  const orderStore = useOrderStore()
  const location = useLocationStore()
  const order = ref<RiderOrder | null>(null)
  const orderNo = ref('')

  const statusText = computed<string>(
    () => RIDER_ORDER_STATUS_TEXT[(order.value?.status ?? 50) as RiderOrderStatus] ?? '处理中'
  )

  const canPickup = computed(() => order.value?.status === 20 || order.value?.status === 30)
  const canDeliver = computed(() => order.value?.status === 40)
  const canAbnormal = computed(() => order.value && [20, 30, 40].includes(order.value.status))
  const canTransfer = computed(() => order.value && [20, 30].includes(order.value.status))

  onLoad(async (q) => {
    const params = q as Record<string, string | undefined>
    orderNo.value = params.orderNo ?? ''
    track(TRACK.VIEW_ORDER_DETAIL, { orderNo: orderNo.value })
    await loadDetail()
  })

  onShow(async () => {
    if (orderNo.value) await loadDetail()
  })

  async function loadDetail() {
    const data = await orderStore.loadDetail(orderNo.value, true)
    if (data) {
      order.value = data
    } else {
      /* mock fallback */
      const mock = mockResolve.inProgressOrders.find((o) => o.orderNo === orderNo.value)
      order.value = mock
        ? { ...mock }
        : { ...mockResolve.inProgressOrders[0], orderNo: orderNo.value }
    }
  }

  async function navTo(target: 'pickup' | 'deliver') {
    if (!order.value) return
    const loc = await location.pickOnce()
    const fromLat = loc?.lat
    const fromLng = loc?.lng
    const params = {
      fromLat,
      fromLng,
      toLat: target === 'pickup' ? order.value.pickupLat : order.value.deliverLat,
      toLng: target === 'pickup' ? order.value.pickupLng : order.value.deliverLng,
      toName: target === 'pickup' ? order.value.pickupName : order.value.deliverName,
      mode: 'ride' as const
    }
    const choice = await showNavChoose(params)
    if (choice === 'inner') {
      uni.navigateTo({
        url: `/pages-order/nav?orderNo=${orderNo.value}&target=${target}`
      })
    }
    track(target === 'pickup' ? TRACK.CLICK_NAV_PICKUP : TRACK.CLICK_NAV_DELIVER, {
      orderNo: orderNo.value
    })
  }

  async function callShop() {
    if (!order.value) return
    try {
      const r = await callRelay({ orderNo: orderNo.value, to: 'shop' })
      uni.makePhoneCall({ phoneNumber: r.relayNumber })
      track(TRACK.CALL_RELAY, { orderNo: orderNo.value, to: 'shop' })
    } catch (e) {
      logger.warn('call.shop.fail', { e: String(e) })
      uni.makePhoneCall({ phoneNumber: order.value.pickupMobileMask ?? '' })
    }
  }

  async function callCustomer() {
    if (!order.value) return
    try {
      const r = await callRelay({ orderNo: orderNo.value, to: 'customer' })
      uni.makePhoneCall({ phoneNumber: r.relayNumber })
      track(TRACK.CALL_RELAY, { orderNo: orderNo.value, to: 'customer' })
    } catch (e) {
      logger.warn('call.customer.fail', { e: String(e) })
      uni.makePhoneCall({ phoneNumber: order.value.deliverMobileMask ?? '' })
    }
  }

  function goPickup() {
    uni.navigateTo({ url: `/pages-order/pickup-scan?orderNo=${orderNo.value}` })
  }

  function goDeliver() {
    uni.navigateTo({ url: `/pages-order/proof-upload?orderNo=${orderNo.value}&kind=deliver` })
  }

  function goAbnormal() {
    uni.navigateTo({ url: `/pages-order/abnormal?orderNo=${orderNo.value}` })
  }

  function goTransfer() {
    uni.navigateTo({ url: `/pages-order/transfer?orderNo=${orderNo.value}` })
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 16rpx 16rpx 200rpx;
    background: $uni-bg-color-grey;
  }

  .card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 16rpx;
      font-size: 28rpx;
      font-weight: 600;
    }
  }

  .top {
    text-align: center;

    &__head {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16rpx;
    }

    &__status {
      margin: 0 16rpx;
      font-size: 28rpx;
      font-weight: 600;
      color: $uni-color-primary;
    }

    &__income {
      font-size: 64rpx;
      font-weight: 700;
      color: $uni-color-error;
    }

    &__no {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .badge {
    padding: 4rpx 12rpx;
    font-size: 22rpx;
    color: #fff;
    border-radius: 8rpx;

    &--biz1 {
      background: $uni-color-primary;
    }

    &--biz2 {
      background: #fa8c16;
    }

    &--ex {
      background: $uni-color-error;
    }
  }

  .row {
    display: flex;
    margin-bottom: 16rpx;

    &__col {
      flex: 1;
    }

    &__name {
      display: block;
      font-size: 28rpx;
      font-weight: 600;
    }

    &__addr {
      display: block;
      margin-top: 4rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__dist {
      display: block;
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-color-primary;
    }
  }

  .dot {
    width: 36rpx;
    height: 36rpx;
    margin-top: 4rpx;
    margin-right: 16rpx;
    font-size: 22rpx;
    font-weight: 600;
    line-height: 36rpx;
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

  .action-row {
    display: flex;
    gap: 16rpx;
  }

  .action {
    flex: 1;
    height: 72rpx;
    font-size: 24rpx;
    line-height: 72rpx;
    color: $uni-color-primary;
    background: #fff;
    border: 2rpx solid $uni-color-primary;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }

  .remark {
    font-size: 24rpx;
    line-height: 1.6;
    color: $uni-color-warning;
  }

  .op-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    z-index: 50;
    display: flex;
    gap: 16rpx;
    width: 100%;
    padding: 24rpx env(safe-area-inset-right) calc(24rpx + env(safe-area-inset-bottom))
      env(safe-area-inset-left);
    background: #fff;
    box-shadow: 0 -4rpx 20rpx rgb(0 0 0 / 6%);

    &__ghost,
    &__primary {
      flex: 1;
      height: 88rpx;
      font-size: 28rpx;
      font-weight: 600;
      line-height: 88rpx;
      border: none;
      border-radius: $uni-border-radius-base;

      &::after {
        border: none;
      }
    }

    &__ghost {
      color: $uni-text-color-grey;
      background: $uni-bg-color-grey;
    }

    &__primary {
      flex: 2;
      color: #fff;
      background: $uni-color-primary;
    }
  }
</style>
