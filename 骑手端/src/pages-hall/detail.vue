<template>
  <view class="page">
    <BizLoading v-if="loading" text="加载中..." />

    <view v-else-if="error" class="error">
      <text class="error__text">{{ error }}</text>
      <button class="error__btn" @click="loadDetail">重新加载</button>
    </view>

    <template v-else-if="detail">
      <view class="card top">
        <view class="top__head">
          <view class="badge" :class="`badge--biz${detail.businessType}`">
            {{ detail.businessType === 1 ? '外卖' : '跑腿' }}
          </view>
          <view v-if="detail.dispatchMode === 1" class="badge badge--mode">系统派单</view>
          <view v-else class="badge badge--grab">抢单</view>
        </view>
        <view class="top__fee">{{ formatAmount(detail.deliveryFee) }}</view>
        <text class="top__label">预估配送费</text>
        <text class="top__no">订单号 {{ detail.orderNo }}</text>
      </view>

      <view class="card">
        <view class="card__title">路线信息</view>
        <view class="route">
          <view class="route__line">
            <text class="dot dot--from">A</text>
            <view class="route__col">
              <text class="route__name">{{ detail.pickupName }}</text>
              <text class="route__addr">{{ detail.pickupAddress }}</text>
              <text class="route__dist">距您 {{ formatDistance(detail.pickupDistance) }}</text>
            </view>
          </view>
          <view class="route__divider" />
          <view class="route__line">
            <text class="dot dot--to">B</text>
            <view class="route__col">
              <text class="route__name">{{ detail.deliverName }}</text>
              <text class="route__addr">{{ detail.deliverAddress }}</text>
              <text class="route__dist"
                >配送 {{ formatDistance(detail.deliverDistance) }} · 预计
                {{ detail.estDeliverMin }} 分钟</text
              >
            </view>
          </view>
        </view>
      </view>

      <view v-if="detail.goodsAmount" class="card">
        <view class="card__title">商品信息</view>
        <view class="info-row">
          <text class="info-row__label">商品总额</text>
          <text class="info-row__value">{{ formatAmount(detail.goodsAmount) }}</text>
        </view>
      </view>

      <view v-if="detail.remark" class="card">
        <view class="card__title">备注</view>
        <text class="remark">{{ detail.remark }}</text>
      </view>

      <view class="bottom-bar">
        <button class="bottom-bar__reject" @click="onReject">拒单</button>
        <button class="bottom-bar__accept" :loading="accepting" @click="onAccept">
          立即接单
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import type { DispatchOrder } from '@/types/biz'
  import { useDispatchStore } from '@/store'
  import { fetchDispatchDetail } from '@/api/dispatch'
  import { formatAmount, formatDistance } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import { mockResolve } from '@/api/_mock'

  const dispatchStore = useDispatchStore()
  const detail = ref<DispatchOrder | null>(null)
  const loading = ref(true)
  const error = ref('')
  const accepting = ref(false)
  const orderNo = ref('')

  onLoad(async (q) => {
    const params = q as Record<string, string | undefined>
    orderNo.value = params.orderNo ?? ''
    track(TRACK.VIEW_ORDER_DETAIL, { orderNo: orderNo.value, scene: 'pre-accept' })
    await loadDetail()
  })

  async function loadDetail() {
    if (!orderNo.value) {
      error.value = '缺少订单号'
      loading.value = false
      return
    }
    loading.value = true
    error.value = ''
    try {
      detail.value = await fetchDispatchDetail(orderNo.value)
    } catch (e) {
      logger.warn('hall.detail.load.fail', { orderNo: orderNo.value, e: String(e) })
      const mock = mockResolve.hallList.find((o) => o.orderNo === orderNo.value)
      if (mock) {
        detail.value = { ...mock }
      } else if (mockResolve.hallList[0]) {
        detail.value = { ...mockResolve.hallList[0], orderNo: orderNo.value }
      } else {
        error.value = '加载失败，请重试'
      }
    } finally {
      loading.value = false
    }
  }

  async function onAccept() {
    if (!detail.value || accepting.value) return
    accepting.value = true
    try {
      let ok: boolean
      if (detail.value.dispatchMode === 1) {
        ok = await dispatchStore.acceptDispatch(orderNo.value)
      } else {
        ok = await dispatchStore.grabOrder(orderNo.value)
      }
      if (ok) {
        uni.showToast({ title: '接单成功', icon: 'success' })
        uni.redirectTo({ url: `/pages-order/detail?orderNo=${orderNo.value}` })
      } else {
        uni.showToast({ title: '接单失败，请重试', icon: 'none' })
      }
    } finally {
      accepting.value = false
    }
  }

  function onReject() {
    if (!detail.value) return
    void dispatchStore.rejectDispatch(orderNo.value)
    uni.showToast({ title: '已拒单', icon: 'none' })
    uni.navigateBack()
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
      gap: 12rpx;
      margin-bottom: 20rpx;
    }

    &__fee {
      font-size: 64rpx;
      font-weight: 700;
      color: $uni-color-error;
    }

    &__label {
      display: block;
      margin-top: 4rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__no {
      display: block;
      margin-top: 12rpx;
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

    &--mode {
      background: $uni-color-primary;
    }

    &--grab {
      background: #fa8c16;
    }
  }

  .route {
    padding: 16rpx;
    background: $uni-bg-color-grey;
    border-radius: 12rpx;

    &__line {
      display: flex;
      padding: 12rpx 0;
    }

    &__divider {
      height: 1rpx;
      margin: 0 52rpx 0 52rpx;
      background: $uni-border-color;
    }

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

  .info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8rpx 0;

    &__label {
      font-size: 26rpx;
      color: $uni-text-color-grey;
    }

    &__value {
      font-size: 26rpx;
      font-weight: 600;
    }
  }

  .remark {
    font-size: 24rpx;
    line-height: 1.6;
    color: $uni-color-warning;
  }

  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;

    &__text {
      margin-bottom: 24rpx;
      font-size: 28rpx;
      color: $uni-text-color-grey;
    }

    &__btn {
      width: 300rpx;
      height: 80rpx;
      font-size: 28rpx;
      line-height: 80rpx;
      color: #fff;
      background: $uni-color-primary;
      border: none;
      border-radius: $uni-border-radius-base;

      &::after {
        border: none;
      }
    }
  }

  .bottom-bar {
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

    &__reject,
    &__accept {
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

    &__reject {
      color: $uni-text-color-grey;
      background: $uni-bg-color-grey;
    }

    &__accept {
      flex: 2;
      color: #fff;
      background: $uni-color-primary;
    }
  }
</style>
