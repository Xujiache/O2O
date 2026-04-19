<template>
  <view class="nav">
    <map
      :longitude="centerLng"
      :latitude="centerLat"
      :scale="14"
      :markers="markers"
      :polyline="polylines"
      :include-points="includePoints"
      class="nav__map"
      show-location
    />
    <view class="nav__panel">
      <view class="nav__title"> {{ targetText }} · {{ formatDistance(distance) }} </view>
      <view class="nav__addr">{{ targetAddr }}</view>
      <view class="nav__actions">
        <button class="nav__btn nav__btn--ghost" @click="onExternalNav">外跳导航</button>
        <button class="nav__btn nav__btn--primary" @click="onClose">关闭</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { onLoad, onShow } from '@dcloudio/uni-app'
  import { useOrderStore, useLocationStore } from '@/store'
  import { showNavChoose } from '@/utils/navigator'
  import { formatDistance } from '@/utils/format'
  import { haversineMeters } from '@/utils/kalman'
  import type { RiderOrder } from '@/types/biz'

  /**
   * 内置导航：MapView + 路径折线（A→B 直线占位，真路径由 P9 高德 SDK 返）
   *   T7.24
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const orderStore = useOrderStore()
  const location = useLocationStore()
  const orderNo = ref('')
  const target = ref<'pickup' | 'deliver'>('pickup')
  const order = ref<RiderOrder | null>(null)
  const myLng = ref(116.481)
  const myLat = ref(39.916)

  const targetText = computed(() => (target.value === 'pickup' ? '导航至取件点' : '导航至送达点'))
  const targetLat = computed(() =>
    target.value === 'pickup' ? (order.value?.pickupLat ?? 0) : (order.value?.deliverLat ?? 0)
  )
  const targetLng = computed(() =>
    target.value === 'pickup' ? (order.value?.pickupLng ?? 0) : (order.value?.deliverLng ?? 0)
  )
  const targetAddr = computed(() =>
    target.value === 'pickup'
      ? (order.value?.pickupAddress ?? '')
      : (order.value?.deliverAddress ?? '')
  )
  const distance = computed(() =>
    haversineMeters(
      { lng: myLng.value, lat: myLat.value },
      { lng: targetLng.value, lat: targetLat.value }
    )
  )

  const centerLng = computed(() => (myLng.value + targetLng.value) / 2)
  const centerLat = computed(() => (myLat.value + targetLat.value) / 2)

  const markers = computed(() => [
    {
      id: 1,
      latitude: myLat.value,
      longitude: myLng.value,
      title: '我',
      iconPath: '/static/marker/marker-rider.png',
      width: 24,
      height: 24
    },
    {
      id: 2,
      latitude: targetLat.value,
      longitude: targetLng.value,
      title: targetText.value,
      iconPath:
        target.value === 'pickup'
          ? '/static/marker/marker-pickup.png'
          : '/static/marker/marker-deliver.png',
      width: 32,
      height: 32
    }
  ])

  const polylines = computed(() => [
    {
      points: [
        { latitude: myLat.value, longitude: myLng.value },
        { latitude: targetLat.value, longitude: targetLng.value }
      ],
      color: target.value === 'pickup' ? '#FA8C16' : '#00B578',
      width: 6,
      arrowLine: true
    }
  ])

  const includePoints = computed(() => [
    { latitude: myLat.value, longitude: myLng.value },
    { latitude: targetLat.value, longitude: targetLng.value }
  ])

  onLoad(async (q) => {
    const params = q as Record<string, string | undefined>
    orderNo.value = params.orderNo ?? ''
    target.value = params.target === 'deliver' ? 'deliver' : 'pickup'
    order.value = await orderStore.loadDetail(orderNo.value)
  })

  onShow(async () => {
    const loc = await location.pickOnce()
    if (loc) {
      myLat.value = loc.lat
      myLng.value = loc.lng
    }
  })

  async function onExternalNav() {
    if (!order.value) return
    await showNavChoose({
      fromLat: myLat.value,
      fromLng: myLng.value,
      toLat: targetLat.value,
      toLng: targetLng.value,
      toName: targetText.value,
      mode: 'ride'
    })
  }

  function onClose() {
    uni.navigateBack()
  }
</script>

<style lang="scss" scoped>
  .nav {
    position: relative;
    width: 100vw;
    height: 100vh;

    &__map {
      width: 100%;
      height: 100%;
    }

    &__panel {
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      padding: 24rpx env(safe-area-inset-right) calc(24rpx + env(safe-area-inset-bottom))
        env(safe-area-inset-left);
      background: #fff;
      border-radius: 24rpx 24rpx 0 0;
      box-shadow: 0 -4rpx 20rpx rgb(0 0 0 / 8%);
    }

    &__title {
      margin-bottom: 8rpx;
      font-size: 28rpx;
      font-weight: 600;
      color: $uni-color-primary;
    }

    &__addr {
      margin-bottom: 16rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__actions {
      display: flex;
      gap: 16rpx;
    }

    &__btn {
      flex: 1;
      height: 80rpx;
      font-size: 28rpx;
      line-height: 80rpx;
      border: none;
      border-radius: $uni-border-radius-base;

      &::after {
        border: none;
      }

      &--ghost {
        color: $uni-color-primary;
        background: #fff;
        border: 2rpx solid $uni-color-primary;
      }

      &--primary {
        color: $uni-text-color-grey;
        background: $uni-bg-color-grey;
      }
    }
  }
</style>
