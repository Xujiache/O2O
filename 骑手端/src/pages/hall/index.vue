<template>
  <view class="hall">
    <view class="hall__filters">
      <view class="hall__filter">
        <text>类型</text>
        <picker :range="bizOptions" range-key="label" @change="onBizChange">
          <view class="hall__pick">
            {{ currentBizLabel }}
            <text class="hall__arrow">▾</text>
          </view>
        </picker>
      </view>
      <view class="hall__filter">
        <text>排序</text>
        <picker :range="sortOptions" range-key="label" @change="onSortChange">
          <view class="hall__pick">
            {{ currentSortLabel }}
            <text class="hall__arrow">▾</text>
          </view>
        </picker>
      </view>
      <view class="hall__refresh" @click="onRefresh">
        <text>{{ dispatch.hallLoading ? '⟳ 加载中' : '↻ 刷新' }}</text>
      </view>
    </view>

    <BizLoading v-if="dispatch.hallLoading && hallList.length === 0" />
    <BizEmpty
      v-else-if="hallList.length === 0"
      title="抢单池暂无可接订单"
      desc="可下拉刷新或开启系统派单"
      scene="dispatch"
    >
      <template #action>
        <BizBtn type="primary" @click="goPreference">前往设置</BizBtn>
      </template>
    </BizEmpty>

    <scroll-view v-else scroll-y class="hall__list" @scrolltolower="onLoadMore">
      <view v-for="o in hallList" :key="o.orderNo" class="card" @click="goOrderDetail(o.orderNo)">
        <view class="card__header">
          <view class="card__biz" :class="`card__biz--${o.businessType}`">
            {{ o.businessType === 1 ? '外卖' : '跑腿' }}
          </view>
          <view class="card__route">
            {{ formatDistance(o.pickupDistance) }} 取件 · 配送
            {{ formatDistance(o.deliverDistance) }}
          </view>
          <view class="card__fee">{{ formatAmount(o.deliveryFee) }}</view>
        </view>

        <view class="card__row">
          <text class="card__dot card__dot--from">A</text>
          <text class="card__addr">{{ o.pickupAddress }}</text>
        </view>
        <view class="card__row">
          <text class="card__dot card__dot--to">B</text>
          <text class="card__addr">{{ o.deliverAddress }}</text>
        </view>

        <view class="card__footer">
          <text class="card__est">预计 {{ o.estDeliverMin }} 分钟送达</text>
          <button class="card__grab" @click.stop="onGrab(o.orderNo)">立即抢单</button>
        </view>
      </view>
    </scroll-view>

    <BizDispatchModal />
  </view>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app'
  import { useAuthStore, useDispatchStore } from '@/store'
  import { formatAmount, formatDistance } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 接单大厅：按距离/配送费/顺路排序的抢单池
   *   T7.13 + T7.16
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const auth = useAuthStore()
  const dispatch = useDispatchStore()

  const bizOptions = [
    { value: 3, label: '全部' },
    { value: 1, label: '外卖' },
    { value: 2, label: '跑腿' }
  ]

  const sortOptions = [
    { value: 'distance', label: '距离最近' },
    { value: 'fee', label: '配送费高' },
    { value: 'route', label: '顺路推荐' }
  ]

  const bizIdx = ref(0)
  const sortIdx = ref(0)

  const currentBizLabel = computed(() => bizOptions[bizIdx.value].label)
  const currentSortLabel = computed(() => sortOptions[sortIdx.value].label)

  /** 客户端二次过滤后的列表 */
  const hallList = computed(() => {
    const bizVal = bizOptions[bizIdx.value].value
    const sortVal = sortOptions[sortIdx.value].value
    let arr = dispatch.hallList.slice()
    if (bizVal !== 3) arr = arr.filter((o) => o.businessType === bizVal)
    arr.sort((a, b) => {
      switch (sortVal) {
        case 'fee':
          return Number(b.deliveryFee) - Number(a.deliveryFee)
        case 'route':
          return (b.routeScore ?? 0) - (a.routeScore ?? 0)
        default:
          return a.pickupDistance - b.pickupDistance
      }
    })
    return arr
  })

  onLoad(() => {
    track(TRACK.VIEW_HALL)
  })

  onShow(async () => {
    if (!auth.canAcceptOrders) {
      uni.showToast({ title: '资质未通过或保证金未交', icon: 'none' })
      return
    }
    await dispatch.refreshHall(true)
  })

  onPullDownRefresh(async () => {
    await dispatch.refreshHall(true)
    uni.stopPullDownRefresh()
  })

  function onRefresh() {
    void dispatch.refreshHall(true)
  }

  function onBizChange(e: Event) {
    const detail = (e as Event & { detail: { value: number } }).detail
    bizIdx.value = Number(detail.value)
  }

  function onSortChange(e: Event) {
    const detail = (e as Event & { detail: { value: number } }).detail
    sortIdx.value = Number(detail.value)
  }

  function onLoadMore() {
    /* 接单大厅是一个时序池，5s 自动刷新即可，无 nextCursor 加载更多 */
    void dispatch.refreshHall()
  }

  async function onGrab(orderNo: string) {
    uni.showLoading({ title: '抢单中...', mask: true })
    const ok = await dispatch.grabOrder(orderNo)
    uni.hideLoading()
    if (ok) {
      uni.showToast({ title: '抢单成功', icon: 'success' })
      track(TRACK.GRAB_SUCCESS, { orderNo })
      uni.navigateTo({ url: `/pages-order/detail?orderNo=${orderNo}` })
    } else {
      uni.showToast({ title: '已被其他骑手抢走', icon: 'none' })
      track(TRACK.GRAB_FAIL, { orderNo })
      void dispatch.refreshHall(true)
    }
  }

  function goPreference() {
    uni.navigateTo({ url: '/pages-setting/accept' })
  }

  function goOrderDetail(orderNo: string) {
    uni.navigateTo({ url: `/pages-hall/detail?orderNo=${orderNo}` })
  }

  void logger
</script>

<style lang="scss" scoped>
  .hall {
    min-height: 100vh;
    padding: 24rpx 24rpx 32rpx;
    background: $uni-bg-color-grey;

    &__filters {
      display: flex;
      gap: 16rpx;
      align-items: center;
      padding: 16rpx 24rpx;
      margin-bottom: 16rpx;
      background: #fff;
      border-radius: 12rpx;
    }

    &__filter {
      display: flex;
      flex: 1;
      flex-direction: column;
      font-size: 20rpx;
      color: $uni-text-color-grey;
    }

    &__pick {
      margin-top: 4rpx;
      font-size: 26rpx;
      color: $uni-text-color;
    }

    &__arrow {
      margin-left: 4rpx;
      color: $uni-text-color-placeholder;
    }

    &__refresh {
      padding: 8rpx 16rpx;
      font-size: 24rpx;
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-radius: 16rpx;
    }

    &__list {
      max-height: calc(100vh - 200rpx);
    }
  }

  .card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;
    box-shadow: $rider-card-shadow;

    &__header {
      display: flex;
      align-items: center;
      margin-bottom: 16rpx;
    }

    &__biz {
      padding: 4rpx 12rpx;
      margin-right: 12rpx;
      font-size: 22rpx;
      color: #fff;
      border-radius: 8rpx;

      &--1 {
        background: $uni-color-primary;
      }

      &--2 {
        background: #fa8c16;
      }
    }

    &__route {
      flex: 1;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__fee {
      font-size: 32rpx;
      font-weight: 700;
      color: $uni-color-error;
    }

    &__row {
      display: flex;
      align-items: flex-start;
      margin-bottom: 8rpx;
      font-size: 24rpx;
      color: $uni-text-color;
    }

    &__dot {
      width: 32rpx;
      height: 32rpx;
      margin-right: 12rpx;
      font-size: 18rpx;
      font-weight: 600;
      line-height: 32rpx;
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

    &__addr {
      flex: 1;
    }

    &__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 16rpx;
      margin-top: 8rpx;
      border-top: 1rpx solid $uni-border-color;
    }

    &__est {
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__grab {
      width: 200rpx;
      height: 64rpx;
      padding: 0;
      font-size: 26rpx;
      line-height: 64rpx;
      color: #fff;
      background: $uni-color-primary;
      border: none;
      border-radius: $uni-border-radius-base;

      &::after {
        border: none;
      }
    }
  }
</style>
