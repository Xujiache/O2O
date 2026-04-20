<template>
  <view class="page order-list">
    <view class="order-list__tabs">
      <view
        v-for="(t, i) in tabs"
        :key="t.value"
        class="order-list__tab"
        :class="{ 'order-list__tab--active': activeTab === i }"
        @tap="onTabChange(i)"
      >
        <text>{{ t.label }}</text>
      </view>
    </view>

    <view class="order-list__filter">
      <view
        v-for="t in typeFilter"
        :key="t.value"
        class="order-list__chip"
        :class="{ 'order-list__chip--active': orderType === t.value }"
        @tap="onTypeChange(t.value)"
      >
        <text>{{ t.label }}</text>
      </view>
    </view>

    <BizLoading v-if="loading && orders.length === 0" />
    <BizEmpty v-else-if="!loading && orders.length === 0" text="暂无订单" />
    <scroll-view v-else scroll-y class="order-list__scroll" @scrolltolower="onLoadMore">
      <view
        v-for="o in orders"
        :key="o.orderNo"
        class="order-list__card"
        @tap="goDetail(o.orderNo)"
      >
        <view class="order-list__card-head">
          <text class="order-list__card-name">
            {{ 'shopName' in o ? o.shopName : `跑腿 · ${errandTypeText(o.serviceType)}` }}
          </text>
          <text class="order-list__card-status">{{ statusText(o.status) }}</text>
        </view>
        <view class="order-list__card-meta">
          <text class="order-list__card-time">{{ formatTime(o.createdAt) }}</text>
          <text class="order-list__card-amount">{{ formatAmount(o.payAmount) }}</text>
        </view>
        <view v-if="getDesc(o)" class="order-list__card-desc">
          <text>{{ getDesc(o) }}</text>
        </view>
        <view v-if="getCardActions(o).length > 0" class="order-list__card-actions">
          <view
            v-for="act in getCardActions(o)"
            :key="act.code"
            class="order-list__card-btn"
            :class="{ 'order-list__card-btn--primary': act.primary }"
            @tap.stop="onCardAction(act.code, o)"
          >
            <text>{{ act.label }}</text>
          </view>
        </view>
      </view>
      <view v-if="hasMore" class="order-list__more">
        <text>{{ loading ? '加载中...' : '上拉加载更多' }}</text>
      </view>
      <view v-else class="order-list__more">
        <text>—— 没有更多了 ——</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/order/index.vue
   * @stage P5/T5.27 (Sprint 5) + P5-REVIEW-01 R1 (I-01 / I-12)
   * @desc 订单列表：5 Tab + 类型 chip（外卖/跑腿）+ keyset 分页 + 卡片快捷按钮
   *
   * Tab 设计（P5-REVIEW-01 R1 后）：
   * - 全部     ：所有订单（statusIn=undefined / isReviewed=undefined）
   * - 进行中   ：status ∈ [0,10,20,30,40,50] —— 涵盖待支付/待接单/已接单/出餐/配送/已送达
   *              （spec 建议的"待支付/待接单"分 Tab 因数据较稀疏，合并到"进行中"，
   *               用户在 Tab 内通过卡片状态 chip 快速识别）
   * - 待评价   ：status = 55 且 isReviewed = 0
   * - 已完成   ：status = 55 且 isReviewed = 1
   * - 售后     ：status = 70
   *
   * I-01 修复要点（R1）：
   * - 增加 isReviewed 字段透传后端（OrderListParams 已扩）
   * - 后端 listOrders 当前不支持服务端 isReviewed 过滤（待 P9）→ 前端拿 list 后做客户端兜底过滤
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import { listOrders } from '@/api/order'
  import { useUserStore } from '@/store/user'
  import { ORDER_STATUS_TEXT } from '@/types/biz'
  import type { OrderTakeout, OrderErrand, OrderStatus, ErrandServiceType } from '@/types/biz'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  const user = useUserStore()

  /**
   * Tab 定义（含 isReviewed 区分待评价/已完成；详见组件头部 JSDoc）
   * - statusIn: 状态码白名单（undefined = 全部）
   * - isReviewed: 仅 status=55 生效（0 待评价 / 1 已完成 / undefined 不约束）
   */
  const tabs = [
    { label: '全部', value: 'all', statusIn: undefined, isReviewed: undefined },
    {
      label: '进行中',
      value: 'doing',
      statusIn: [0, 10, 20, 30, 40, 50],
      isReviewed: undefined
    },
    { label: '待评价', value: 'to_review', statusIn: [55], isReviewed: 0 as const },
    { label: '已完成', value: 'finished', statusIn: [55], isReviewed: 1 as const },
    { label: '售后', value: 'after_sale', statusIn: [70], isReviewed: undefined }
  ] as const

  const typeFilter = [
    { label: '全部', value: 0 as const },
    { label: '外卖', value: 1 as const },
    { label: '跑腿', value: 2 as const }
  ]

  const activeTab = ref<number>(0)
  const orderType = ref<0 | 1 | 2>(0)
  const orders = ref<Array<OrderTakeout | OrderErrand>>([])
  const loading = ref<boolean>(false)
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)

  const queryParams = computed(() => {
    const t = tabs[activeTab.value]
    return {
      orderType: orderType.value,
      statusIn: t.statusIn ? [...t.statusIn] : undefined,
      isReviewed: t.isReviewed,
      pageSize: 20
    }
  })

  onShow(() => {
    track(TRACK.VIEW_ORDER_LIST)
    if (user.isLogin) void load(true)
  })

  onPullDownRefresh(() => {
    void load(true).finally(() => uni.stopPullDownRefresh())
  })

  async function load(reset = false) {
    if (!user.isLogin) {
      uni.navigateTo({
        url: '/pages/login/index?redirect=' + encodeURIComponent('/pages/order/index')
      })
      return
    }
    if (reset) {
      cursor.value = null
      hasMore.value = true
      orders.value = []
    }
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const params = queryParams.value
      const r = await listOrders({
        ...params,
        cursor: cursor.value ?? undefined
      })
      orders.value = reset ? r.list : [...orders.value, ...r.list]
      cursor.value = r.nextCursor ?? null
      hasMore.value = r.hasMore
    } catch (e) {
      logger.warn('order.list.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function onTabChange(i: number) {
    activeTab.value = i
    void load(true)
  }

  function onTypeChange(t: 0 | 1 | 2) {
    orderType.value = t
    void load(true)
  }

  function onLoadMore() {
    void load(false)
  }

  function goDetail(orderNo: string) {
    track(TRACK.VIEW_ORDER_DETAIL, { orderNo, from: 'list' })
    uni.navigateTo({ url: `/pages-order/detail?orderNo=${orderNo}` })
  }

  function statusText(s: OrderStatus): string {
    return ORDER_STATUS_TEXT[s] ?? '未知'
  }

  function errandTypeText(t: ErrandServiceType): string {
    return ['', '帮送', '帮取', '帮买', '帮排队'][t] ?? ''
  }

  function getDesc(o: OrderTakeout | OrderErrand): string {
    if ('items' in o) {
      const first = o.items[0]
      if (!first) return ''
      const more = o.items.length > 1 ? `等 ${o.items.length} 件` : ''
      return `${first.productName} ${more}`
    }
    return o.itemDescription ?? ''
  }

  interface CardAction {
    code: 'pay' | 'confirm' | 'review' | 'reorder' | 'after_sale'
    label: string
    primary?: boolean
  }

  function getCardActions(o: OrderTakeout | OrderErrand): CardAction[] {
    const acts: CardAction[] = []
    switch (o.status) {
      case 0:
        acts.push({ code: 'pay', label: '去支付', primary: true })
        break
      case 50:
        acts.push({ code: 'confirm', label: '确认收货', primary: true })
        break
      case 55:
        acts.push({ code: 'review', label: '去评价', primary: true })
        if ('shopId' in o) {
          acts.push({ code: 'reorder', label: '再来一单' })
        }
        break
      case 60:
        if ('shopId' in o) {
          acts.push({ code: 'reorder', label: '再来一单', primary: true })
        }
        break
      default:
        break
    }
    return acts
  }

  function onCardAction(code: CardAction['code'], o: OrderTakeout | OrderErrand) {
    switch (code) {
      case 'pay':
        track(TRACK.CLICK_PAY, { orderNo: o.orderNo, from: 'list' })
        uni.navigateTo({ url: `/pages/pay/index?orderNo=${o.orderNo}` })
        break
      case 'confirm':
      case 'reorder':
      case 'review':
      case 'after_sale':
        goDetail(o.orderNo)
        break
    }
  }
</script>

<style lang="scss" scoped>
  .order-list {
    display: flex;
    flex-direction: column;
    height: 100vh;

    &__tabs {
      display: flex;
      background: #fff;
      border-bottom: 1rpx solid #f2f2f2;
    }

    &__tab {
      flex: 1;
      padding: 24rpx 0;
      font-size: 28rpx;
      color: #666;
      text-align: center;

      &--active {
        font-weight: 500;
        color: #ff6a1a;
        border-bottom: 4rpx solid #ff6a1a;
      }
    }

    &__filter {
      display: flex;
      gap: 16rpx;
      padding: 16rpx 24rpx;
      background: #fff;
      border-bottom: 1rpx solid #f2f2f2;
    }

    &__chip {
      padding: 8rpx 24rpx;
      font-size: 24rpx;
      color: #666;
      background: #f2f2f2;
      border-radius: 24rpx;

      &--active {
        color: #fff;
        background: #ff6a1a;
      }
    }

    &__scroll {
      flex: 1;
      padding: 16rpx;
    }

    &__card {
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: #fff;
      border-radius: 16rpx;
    }

    &__card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16rpx;
    }

    &__card-name {
      flex: 1;
      max-width: 60%;
      overflow: hidden;
      font-size: 30rpx;
      font-weight: 500;
      color: #333;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__card-status {
      font-size: 24rpx;
      color: #ff6a1a;
    }

    &__card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    &__card-time {
      font-size: 24rpx;
      color: #999;
    }

    &__card-amount {
      font-size: 32rpx;
      font-weight: 600;
      color: #333;
    }

    &__card-desc {
      margin-top: 8rpx;
      overflow: hidden;
      font-size: 24rpx;
      color: #666;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__card-actions {
      display: flex;
      gap: 16rpx;
      justify-content: flex-end;
      margin-top: 16rpx;
      padding-top: 16rpx;
      border-top: 1rpx solid #f2f2f2;
    }

    &__card-btn {
      padding: 10rpx 28rpx;
      font-size: 24rpx;
      color: #666;
      background: #fff;
      border: 1rpx solid #ddd;
      border-radius: 28rpx;

      &--primary {
        color: #ff6a1a;
        background: rgba(255, 106, 26, 0.08);
        border-color: rgba(255, 106, 26, 0.4);
      }
    }

    &__more {
      padding: 32rpx 0;
      font-size: 24rpx;
      color: #999;
      text-align: center;
    }
  }
</style>
