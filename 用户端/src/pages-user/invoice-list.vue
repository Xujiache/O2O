<template>
  <view class="page invoice-list">
    <view class="invoice-list__tabs">
      <view
        v-for="(t, i) in tabs"
        :key="t.value"
        class="invoice-list__tab"
        :class="{ 'invoice-list__tab--active': activeTab === i }"
        @tap="onTabChange(i)"
      >
        <text>{{ t.label }}</text>
      </view>
    </view>

    <BizLoading v-if="loading && list.length === 0" />
    <BizEmpty v-else-if="!loading && list.length === 0" text="暂无发票记录" />
    <scroll-view v-else scroll-y class="invoice-list__scroll" @scrolltolower="onLoadMore">
      <view v-for="iv in list" :key="iv.id" class="invoice-list__item">
        <view class="invoice-list__row">
          <text class="invoice-list__title">{{ iv.title }}</text>
          <text
            class="invoice-list__status"
            :class="`invoice-list__status--${statusClass(iv.status)}`"
          >
            {{ statusText(iv.status) }}
          </text>
        </view>
        <view class="invoice-list__row invoice-list__row--meta">
          <text class="invoice-list__order">订单 {{ iv.orderNo }}</text>
          <text class="invoice-list__amount">{{ formatAmount(iv.amount) }}</text>
        </view>
        <view class="invoice-list__row invoice-list__row--meta">
          <text class="invoice-list__time">{{ formatTime(iv.createdAt) }}</text>
          <text v-if="iv.invoiceNo" class="invoice-list__no">发票号：{{ iv.invoiceNo }}</text>
        </view>
      </view>
      <view class="invoice-list__more">
        <text>{{ hasMore ? (loading ? '加载中...' : '上拉加载更多') : '—— 没有更多了 ——' }}</text>
      </view>
    </scroll-view>

    <view class="invoice-list__footer safe-bottom">
      <button class="invoice-list__apply" @tap="goApply">申请开票</button>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/invoice-list.vue
   * @stage P5/T5.38 (Sprint 6)
   * @desc 发票记录：Tab（全部/待开/已开/失败）+ keyset 分页 + 申请开票入口
   * @author 单 Agent V2.0
   */
  import { ref } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import { listInvoices } from '@/api/invoice'
  import type { Invoice } from '@/types/biz'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'

  interface TabDef {
    label: string
    value: 'all' | 'pending' | 'done' | 'fail'
    status?: number
  }

  const tabs: TabDef[] = [
    { label: '全部', value: 'all', status: undefined },
    { label: '待开', value: 'pending', status: 1 },
    { label: '已开', value: 'done', status: 2 },
    { label: '失败', value: 'fail', status: 3 }
  ]

  const activeTab = ref<number>(0)
  const list = ref<Invoice[]>([])
  const loading = ref<boolean>(false)
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)

  onShow(() => {
    void load(true)
  })

  async function load(reset = false) {
    if (reset) {
      cursor.value = null
      hasMore.value = true
      list.value = []
    }
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const r = await listInvoices({
        status: tabs[activeTab.value].status,
        cursor: cursor.value ?? undefined,
        pageSize: 20
      })
      list.value = reset ? r.list : [...list.value, ...r.list]
      cursor.value = r.nextCursor ?? null
      hasMore.value = r.hasMore
    } catch (e) {
      logger.warn('invoice.list.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function onTabChange(i: number) {
    if (i === activeTab.value) return
    activeTab.value = i
    void load(true)
  }

  function onLoadMore() {
    void load(false)
  }

  function goApply() {
    uni.navigateTo({ url: '/pages-user/invoice-apply' })
  }

  function statusText(s: number): string {
    if (s === 1) return '待开'
    if (s === 2) return '已开'
    if (s === 3) return '失败'
    return '未知'
  }

  function statusClass(s: number): string {
    if (s === 1) return 'pending'
    if (s === 2) return 'done'
    if (s === 3) return 'fail'
    return 'pending'
  }
</script>

<style lang="scss" scoped>
  .invoice-list {
    display: flex;
    flex-direction: column;
    height: 100vh;

    &__tabs {
      display: flex;
      background: $color-bg-white;
      border-bottom: 1rpx solid $color-divider;
    }

    &__tab {
      flex: 1;
      padding: 24rpx 0;
      font-size: $font-size-base;
      color: $color-text-regular;
      text-align: center;

      &--active {
        font-weight: $font-weight-medium;
        color: $color-primary;
        border-bottom: 4rpx solid $color-primary;
      }
    }

    &__scroll {
      flex: 1;
      padding: 16rpx;
    }

    &__item {
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__row {
      @include flex-between;

      margin-bottom: 12rpx;

      &:last-child {
        margin-bottom: 0;
      }

      &--meta {
        font-size: $font-size-sm;
        color: $color-text-secondary;
      }
    }

    &__title {
      flex: 1;
      overflow: hidden;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__status {
      flex-shrink: 0;
      margin-left: 16rpx;
      font-size: $font-size-sm;

      &--pending {
        color: $color-warning;
      }

      &--done {
        color: $color-success;
      }

      &--fail {
        color: $color-danger;
      }
    }

    &__order,
    &__time,
    &__no {
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__amount {
      flex-shrink: 0;
      margin-left: 16rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__more {
      padding: 32rpx 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }

    &__footer {
      padding: 16rpx 24rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;
    }

    &__apply {
      width: 100%;
      height: 88rpx;
      font-size: $font-size-md;
      line-height: 88rpx;
      color: $color-text-inverse;
      background: $color-primary;
      border: none;
      border-radius: $radius-lg;
    }
  }
</style>
