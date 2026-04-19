<template>
  <view class="order-page">
    <!-- 6 Tab：每个 status + 子条件唯一区分（规避 P5 statusIn:[55] 重复 bug） -->
    <view class="tabs">
      <view
        v-for="t in tabDefs"
        :key="t.key"
        class="tab"
        :class="{ 'tab--active': currentTab === t.key }"
        @click="onTabChange(t.key)"
      >
        {{ t.label }}
        <text v-if="tabCounts[t.key] > 0" class="tab__badge">{{ tabCounts[t.key] }}</text>
      </view>
    </view>

    <view class="content">
      <BizLoading v-if="state.loading && state.list.length === 0" />
      <BizEmpty
        v-else-if="state.list.length === 0"
        :title="emptyTitle"
        :desc="emptyDesc"
        scene="order"
      />

      <scroll-view v-else scroll-y class="list" @scrolltolower="onLoadMore">
        <BizOrderCard v-for="o in state.list" :key="o.orderNo" :order="o" @click="onOrderClick" />
        <view v-if="!state.hasMore && state.list.length > 0" class="footer-tip">已经到底啦</view>
      </scroll-view>
    </view>

    <BizDispatchModal />
  </view>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app'
  import { useOrderStore } from '@/store'
  import { storeToRefs } from 'pinia'
  import type { RiderOrderTab } from '@/types/biz'
  import { track, TRACK } from '@/utils/track'

  /**
   * 我的订单：6 Tab + 子条件唯一区分（P5/P6 教训）
   *   pending status=20    待取件
   *   picking status=30    取件中
   *   delivering status=40 配送中
   *   finished status=50   已送达
   *   canceled status=60   已取消
   *   abnormal isException=1 异常
   *
   * onShow 5min 节流刷新（P6-R1 / I-07）
   *
   * @author 单 Agent V2.0 (P7 骑手端 / T7.17)
   */
  const orderStore = useOrderStore()
  const { tabs, tabCounts } = storeToRefs(orderStore)

  const tabDefs: { key: RiderOrderTab; label: string }[] = [
    { key: 'pending', label: '待取件' },
    { key: 'picking', label: '取件中' },
    { key: 'delivering', label: '配送中' },
    { key: 'finished', label: '已送达' },
    { key: 'canceled', label: '已取消' },
    { key: 'abnormal', label: '异常' }
  ]

  const currentTab = computed<RiderOrderTab>({
    get: () => orderStore.currentTab,
    set: (v) => {
      orderStore.currentTab = v
    }
  })

  const state = computed(() => tabs.value[currentTab.value])

  const emptyTitle = computed(() => {
    switch (currentTab.value) {
      case 'pending':
        return '暂无待取件订单'
      case 'picking':
        return '暂无取件中订单'
      case 'delivering':
        return '暂无配送中订单'
      case 'finished':
        return '今日尚未完成订单'
      case 'canceled':
        return '暂无已取消订单'
      case 'abnormal':
        return '暂无异常订单'
      default:
        return '暂无订单'
    }
  })

  const emptyDesc = computed(() => {
    if (currentTab.value === 'pending' || currentTab.value === 'picking')
      return '上班后即可在接单大厅抢单'
    return ''
  })

  onLoad(() => {
    track(TRACK.VIEW_ORDER_LIST)
    /* 首次加载所有 Tab 计数 */
    void orderStore.loadTabCounts()
  })

  onShow(() => {
    void orderStore.loadTabCounts()
    /* P6-R1 / I-07：5min 节流，避免频繁切 Tab 抖动 */
    void orderStore.refreshIfStale(currentTab.value)
  })

  onPullDownRefresh(async () => {
    await orderStore.loadTab(currentTab.value, true)
    await orderStore.loadTabCounts()
    uni.stopPullDownRefresh()
  })

  function onTabChange(key: RiderOrderTab) {
    if (currentTab.value === key) return
    currentTab.value = key
    if (!tabs.value[key].loaded) {
      void orderStore.loadTab(key, true)
    } else {
      /* 已加载过：5min 节流刷新 */
      void orderStore.refreshIfStale(key)
    }
  }

  function onLoadMore() {
    void orderStore.loadTab(currentTab.value)
  }

  function onOrderClick(orderNo: string) {
    uni.navigateTo({ url: `/pages-order/detail?orderNo=${orderNo}` })
  }
</script>

<style lang="scss" scoped>
  .order-page {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: $uni-bg-color-grey;
  }

  .tabs {
    display: flex;
    padding: 0 16rpx;
    overflow-x: auto;
    background: #fff;
    border-bottom: 1rpx solid $uni-border-color;
  }

  .tab {
    position: relative;
    flex-shrink: 0;
    padding: 24rpx;
    font-size: 26rpx;
    color: $uni-text-color-grey;

    &--active {
      font-weight: 600;
      color: $uni-color-primary;
      border-bottom: 4rpx solid $uni-color-primary;
    }

    &__badge {
      position: absolute;
      top: 16rpx;
      right: 0;
      min-width: 32rpx;
      height: 32rpx;
      padding: 0 8rpx;
      font-size: 20rpx;
      line-height: 32rpx;
      color: #fff;
      text-align: center;
      background: $uni-color-error;
      border-radius: 16rpx;
    }
  }

  .content {
    flex: 1;
    padding: 16rpx;
  }

  .list {
    height: calc(100vh - 100rpx);
  }

  .footer-tip {
    padding: 32rpx 0;
    font-size: 22rpx;
    color: $uni-text-color-placeholder;
    text-align: center;
  }
</style>
