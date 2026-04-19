<template>
  <view class="page page-order">
    <!-- 顶部 Tab：7 个，每个有清晰的 status + 子条件 -->
    <scroll-view scroll-x class="ord-tabs" :scroll-into-view="`tab-${curTab}`">
      <view
        v-for="t in tabs"
        :id="`tab-${t.key}`"
        :key="t.key"
        class="ord-tab"
        :class="{ 'ord-tab--active': curTab === t.key }"
        @click="onTabChange(t.key)"
      >
        <text class="ord-tab__label">{{ t.label }}</text>
        <text v-if="orderStore.tabCounts[t.key] > 0" class="ord-tab__badge">
          {{ orderStore.tabCounts[t.key] }}
        </text>
      </view>
    </scroll-view>

    <!-- 列表（虚拟滚动） -->
    <scroll-view
      scroll-y
      class="ord-list"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="loadMore"
    >
      <BizOrderCard v-for="order in orders" :key="order.orderNo" :order="order" @click="goDetail">
        <template #actions="{ order: o }">
          <BizBtn
            v-if="o.status === 10"
            type="default"
            text="拒单"
            perm="order:reject"
            @click="onReject(o)"
          />
          <BizBtn
            v-if="o.status === 10"
            type="primary"
            text="接单"
            perm="order:accept"
            @click="onAccept(o)"
          />
          <BizBtn
            v-if="o.status === 20"
            type="primary"
            text="出餐完成"
            perm="order:cook"
            @click="onCooked(o)"
          />
          <BizBtn
            v-if="canReprint(o)"
            type="default"
            text="重新打印"
            perm="order:print"
            @click="onReprint(o)"
          />
          <BizBtn
            v-if="o.status === 70"
            type="warning"
            text="处理售后"
            perm="order:refund-audit"
            @click="goRefundAudit(o)"
          />
          <BizBtn
            v-if="o.status === 10 || o.status === 20"
            type="default"
            text="异常上报"
            @click="goAbnormal(o)"
          />
        </template>
      </BizOrderCard>

      <BizEmpty v-if="!loading && orders.length === 0" :title="emptyTitle" scene="order" />
      <BizLoading v-if="loading" />
      <view v-if="!hasMore && orders.length > 0" class="ord-end">没有更多了</view>
    </scroll-view>

    <!-- 全屏新订单浮层（核心） -->
    <BizNewOrderModal />
  </view>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import { onShow, onHide } from '@dcloudio/uni-app'
  import { useOrderStore, useShopStore } from '@/store'
  import type { MerchantOrder, MerchantOrderTab } from '@/types/biz'
  import {
    listOrders,
    acceptOrder,
    rejectOrder,
    markCooked,
    markPrinted,
    getOrderTabCounts
  } from '@/api/order'
  import { mockEnabled, mockOrders, delay } from '@/api/_mock'
  import { ws } from '@/utils/ws'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import { printer, createPrintTask } from '@/utils/bluetooth-printer'

  /**
   * 订单列表（tabBar 2，T6.18-T6.21）
   *
   * 7 个 Tab，每个 status + 子条件唯一区分（避免 P5 「statusIn:[55]」重复 bug）：
   *   - pending     status=10                   待接单
   *   - cooking     status=20                   待出餐
   *   - delivering  status in [30,40]           配送中
   *   - finished    status in [50,55]           已完成
   *   - canceled    status=60                   已取消
   *   - aftersale   status=70                   售后中
   *   - abnormal    isException=1               异常（与上述并列，用于聚焦异常单）
   *
   * 行为：
   *   - WS 订阅 merchant:order:new → orderStore.pushNewOrder() → NewOrderModal 自动弹层
   *   - WS 订阅 merchant:order:status:changed → 列表局部刷新
   *   - 进入页时拉一次 Tab 计数 + 当前 Tab 列表
   *   - onShow 也刷新 Tab 计数（从其他页返回）
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const orderStore = useOrderStore()
  const shopStore = useShopStore()

  const tabs: { key: MerchantOrderTab; label: string }[] = [
    { key: 'pending', label: '待接单' },
    { key: 'cooking', label: '待出餐' },
    { key: 'delivering', label: '配送中' },
    { key: 'finished', label: '已完成' },
    { key: 'canceled', label: '已取消' },
    { key: 'aftersale', label: '售后中' },
    { key: 'abnormal', label: '异常' }
  ]

  const curTab = ref<MerchantOrderTab>('pending')
  const orders = ref<MerchantOrder[]>([])
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)
  const refreshing = ref<boolean>(false)

  let unsubscribeNewOrder: (() => void) | null = null
  let unsubscribeStatusChanged: (() => void) | null = null

  const emptyTitle = computed<string>(
    () => `暂无${tabs.find((t) => t.key === curTab.value)?.label ?? ''}订单`
  )

  onMounted(() => {
    track(TRACK.VIEW_ORDER_LIST, { tab: curTab.value })
    void loadTabCounts()
    void refresh()
    setupWsSubscriptions()
  })

  onShow(() => {
    void loadTabCounts()
    void refresh()
  })

  onHide(() => {
    /* 不在 onHide 取消订阅，由 onUnmounted 处理（避免切 Tab 误清理） */
  })

  onUnmounted(() => {
    unsubscribeNewOrder?.()
    unsubscribeStatusChanged?.()
  })

  function setupWsSubscriptions() {
    /* 新订单 → 入队 NewOrderModal */
    unsubscribeNewOrder = ws.subscribe<MerchantOrder>('merchant:order:new', (event) => {
      const order = event.data
      if (!order || order.shopId !== shopStore.currentShopId) return
      orderStore.pushNewOrder(order)
    })
    /* 状态变更 → 局部刷新 */
    unsubscribeStatusChanged = ws.subscribe<{ orderNo: string; status: number }>(
      'merchant:order:status:changed',
      () => {
        void loadTabCounts()
        void refresh()
      }
    )
  }

  function onTabChange(k: MerchantOrderTab) {
    if (curTab.value === k) return
    curTab.value = k
    void refresh()
  }

  async function loadTabCounts() {
    if (!shopStore.currentShopId) return
    try {
      if (mockEnabled()) {
        orderStore.setTabCounts({
          pending: 1,
          cooking: 0,
          delivering: 0,
          finished: 5,
          canceled: 0,
          aftersale: 0,
          abnormal: 0
        })
      } else {
        const r = await getOrderTabCounts(shopStore.currentShopId)
        orderStore.setTabCounts(r)
      }
    } catch (e) {
      logger.warn('order.tabCounts.fail', { e: String(e) })
    }
  }

  async function refresh() {
    cursor.value = null
    hasMore.value = true
    orders.value = []
    await loadMore()
  }

  async function onRefresh() {
    refreshing.value = true
    await loadTabCounts()
    await refresh()
    refreshing.value = false
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    if (!shopStore.currentShopId) return
    loading.value = true
    try {
      if (mockEnabled()) {
        const r = await delay({
          list: curTab.value === 'pending' ? mockOrders : ([] as MerchantOrder[]),
          nextCursor: null,
          hasMore: false
        })
        orders.value.push(...r.list)
        cursor.value = r.nextCursor
        hasMore.value = r.hasMore
      } else {
        const r = await listOrders({
          shopId: shopStore.currentShopId,
          tab: curTab.value,
          cursor: cursor.value,
          limit: 20
        })
        orders.value.push(...r.list)
        cursor.value = r.nextCursor
        hasMore.value = r.hasMore
      }
    } catch (e) {
      logger.warn('order.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function goDetail(o: MerchantOrder) {
    uni.navigateTo({ url: `/pages-order/detail?orderNo=${o.orderNo}` })
  }

  function goRefundAudit(o: MerchantOrder) {
    uni.navigateTo({ url: `/pages-order/refund-audit?orderNo=${o.orderNo}` })
  }

  function goAbnormal(o: MerchantOrder) {
    uni.navigateTo({ url: `/pages-order/abnormal?orderNo=${o.orderNo}` })
  }

  async function onAccept(o: MerchantOrder) {
    try {
      if (mockEnabled()) await delay({ ok: true, estimatedCookMin: 25 })
      else await acceptOrder(o.orderNo)
      track(TRACK.CLICK_ACCEPT_ORDER, { orderNo: o.orderNo })
      uni.showToast({ title: '已接单', icon: 'success' })
      await refresh()
    } catch (e) {
      logger.warn('order.accept.fail', { e: String(e) })
    }
  }

  async function onReject(o: MerchantOrder) {
    uni.showActionSheet({
      itemList: ['菜品已售完', '门店繁忙', '配送范围超出', '其他'],
      success: async (res) => {
        const reason = ['菜品已售完', '门店繁忙', '配送范围超出', '其他'][res.tapIndex]
        try {
          if (mockEnabled()) await delay({ ok: true })
          else await rejectOrder(o.orderNo, reason)
          track(TRACK.CLICK_REJECT_ORDER, { orderNo: o.orderNo, reason })
          uni.showToast({ title: '已拒单', icon: 'none' })
          await refresh()
        } catch (e) {
          logger.warn('order.reject.fail', { e: String(e) })
        }
      }
    })
  }

  async function onCooked(o: MerchantOrder) {
    try {
      if (mockEnabled()) await delay({ ok: true })
      else await markCooked(o.orderNo)
      track(TRACK.CLICK_COOK_ORDER, { orderNo: o.orderNo })
      uni.showToast({ title: '已出餐', icon: 'success' })
      await refresh()
    } catch (e) {
      logger.warn('order.cook.fail', { e: String(e) })
    }
  }

  function canReprint(o: MerchantOrder): boolean {
    return o.status === 20 || o.status === 30 || o.status === 40
  }

  async function onReprint(o: MerchantOrder) {
    try {
      printer.enqueue(createPrintTask(o, { copies: 1, copyType: 1 }))
      if (!mockEnabled()) {
        await markPrinted(o.orderNo)
      }
      track(TRACK.CLICK_REPRINT, { orderNo: o.orderNo })
      uni.showToast({ title: '已发送至打印机', icon: 'success' })
    } catch (e) {
      logger.warn('order.reprint.fail', { e: String(e) })
    }
  }
</script>

<style lang="scss" scoped>
  .page-order {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $uni-bg-color-grey;
  }

  .ord-tabs {
    display: flex;
    padding: 0 16rpx;
    white-space: nowrap;
    background: #fff;
    border-bottom: 1rpx solid $uni-border-color;
  }

  .ord-tab {
    display: inline-flex;
    align-items: center;
    padding: 24rpx 24rpx 16rpx;
    font-size: 26rpx;
    color: $uni-text-color-grey;
    border-bottom: 4rpx solid transparent;

    &--active {
      font-weight: 600;
      color: $uni-color-primary;
      border-bottom-color: $uni-color-primary;
    }

    &__badge {
      padding: 0 12rpx;
      margin-left: 8rpx;
      font-size: 18rpx;
      line-height: 28rpx;
      color: #fff;
      background: $uni-color-error;
      border-radius: 999rpx;
    }
  }

  .ord-list {
    flex: 1;
    padding: 16rpx;
  }

  .ord-end {
    padding: 32rpx;
    font-size: 22rpx;
    color: $uni-text-color-placeholder;
    text-align: center;
  }
</style>
