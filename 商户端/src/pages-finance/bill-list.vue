<template>
  <view class="page page-bl">
    <!-- 筛选 -->
    <view class="bl-filter">
      <picker mode="date" :value="startDate" @change="(e: unknown) => onDate('start', e)">
        <text class="bl-filter__date">{{ startDate || '开始日期' }}</text>
      </picker>
      <text class="bl-filter__sep">至</text>
      <picker mode="date" :value="endDate" @change="(e: unknown) => onDate('end', e)">
        <text class="bl-filter__date">{{ endDate || '结束日期' }}</text>
      </picker>
      <picker :range="bizTypeRange" :value="bizTypeIdx" @change="(e: unknown) => onBizType(e)">
        <text class="bl-filter__type">{{ bizTypeRange[bizTypeIdx] }}</text>
      </picker>
      <BizBtn type="primary" text="导出" @click="onExport" />
    </view>

    <!-- 列表 -->
    <scroll-view scroll-y class="bl-list" @scrolltolower="loadMore">
      <view v-for="b in bills" :key="b.id" class="bl-item">
        <view class="bl-item__left">
          <text class="bl-item__name">{{ bizTypeName(b.bizType) }}</text>
          <text class="bl-item__no">{{ b.bizNo }}</text>
          <text class="bl-item__time">{{ formatTime(b.createdAt) }}</text>
        </view>
        <view class="bl-item__right">
          <text
            class="bl-item__amount"
            :class="b.flowDirection === 1 ? 'bl-item__amount--in' : 'bl-item__amount--out'"
          >
            {{ b.flowDirection === 1 ? '+' : '-' }}{{ formatAmount(b.amount, '') }}
          </text>
          <text class="bl-item__balance">余额 {{ formatAmount(b.balanceAfter, '') }}</text>
        </view>
      </view>
      <BizEmpty v-if="!loading && bills.length === 0" title="暂无账单" scene="finance" />
      <BizLoading v-if="loading" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useShopStore } from '@/store'
  import type { BillItem } from '@/types/biz'
  import { listBills, exportBills } from '@/api/finance'
  import { mockEnabled, delay } from '@/api/_mock'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 账单明细（T6.30）+ 导出 CSV
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()

  const bizTypeRange = ['全部', '订单收入', '订单退款', '平台抽佣', '提现', '服务费']
  const bizTypeIdx = ref<number>(0)

  const today = new Date()
  const monthAgo = new Date(today.getTime() - 30 * 86400000)
  const startDate = ref<string>(monthAgo.toISOString().slice(0, 10))
  const endDate = ref<string>(today.toISOString().slice(0, 10))

  const bills = ref<BillItem[]>([])
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)

  onMounted(async () => {
    await refresh()
  })

  function onDate(field: 'start' | 'end', e: unknown) {
    const v = (e as { detail?: { value?: string } })?.detail?.value
    if (!v) return
    if (field === 'start') startDate.value = v
    else endDate.value = v
    void refresh()
  }

  function onBizType(e: unknown) {
    const v = (e as { detail?: { value?: number } })?.detail?.value
    if (typeof v === 'number') {
      bizTypeIdx.value = v
      void refresh()
    }
  }

  function bizTypeName(t: number): string {
    return bizTypeRange[t] ?? '其他'
  }

  async function refresh() {
    cursor.value = null
    hasMore.value = true
    bills.value = []
    await loadMore()
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      if (mockEnabled()) {
        bills.value = await delay([
          {
            id: '1',
            bizType: 1,
            amount: '78.00',
            flowDirection: 1,
            remark: '订单 TO20260418001 收入',
            bizNo: 'TO20260418001',
            balanceAfter: '12658.50',
            createdAt: new Date(Date.now() - 3600000).toISOString()
          },
          {
            id: '2',
            bizType: 3,
            amount: '6.20',
            flowDirection: 2,
            remark: '平台服务费',
            bizNo: 'TO20260418001',
            balanceAfter: '12652.30',
            createdAt: new Date(Date.now() - 3600000).toISOString()
          }
        ] as BillItem[])
        hasMore.value = false
      } else {
        const r = await listBills({
          shopId: shopStore.currentShopId,
          bizType: bizTypeIdx.value === 0 ? undefined : (bizTypeIdx.value as 1 | 2 | 3 | 4 | 5),
          startDate: startDate.value,
          endDate: endDate.value,
          cursor: cursor.value,
          limit: 20
        })
        bills.value.push(...r.list)
        cursor.value = r.nextCursor
        hasMore.value = r.hasMore
      }
    } catch (e) {
      logger.warn('bl.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  async function onExport() {
    try {
      track(TRACK.EXPORT_BILL)
      if (mockEnabled()) {
        uni.showToast({ title: 'mock 模式不支持导出', icon: 'none' })
        return
      }
      const r = await exportBills({
        shopId: shopStore.currentShopId,
        bizType: bizTypeIdx.value === 0 ? undefined : (bizTypeIdx.value as 1 | 2 | 3 | 4 | 5),
        startDate: startDate.value,
        endDate: endDate.value
      })
      uni.setClipboardData({
        data: r.downloadUrl,
        success: () => {
          uni.showModal({
            title: 'CSV 已生成',
            content: `下载链接已复制，过期时间：${formatTime(r.expiresAt)}`,
            showCancel: false
          })
        }
      })
    } catch (e) {
      logger.warn('bl.export.fail', { e: String(e) })
    }
  }
</script>

<style lang="scss" scoped>
  .page-bl {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $uni-bg-color-grey;
  }

  .bl-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 8rpx;
    align-items: center;
    padding: 16rpx 24rpx;
    background: #fff;
    border-bottom: 1rpx solid $uni-border-color;

    &__date,
    &__type {
      padding: 8rpx 16rpx;
      font-size: 24rpx;
      color: $uni-text-color;
      background: $uni-bg-color-grey;
      border-radius: $uni-border-radius-base;
    }

    &__sep {
      margin: 0 8rpx;
      color: $uni-text-color-grey;
    }
  }

  .bl-list {
    flex: 1;
    padding: 16rpx;
  }

  .bl-item {
    display: flex;
    justify-content: space-between;
    padding: 24rpx;
    margin-bottom: 12rpx;
    background: #fff;
    border-radius: 12rpx;

    &__left {
      flex: 1;
    }

    &__name {
      display: block;
      font-size: 26rpx;
      font-weight: 500;
    }

    &__no {
      display: block;
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__time {
      display: block;
      margin-top: 4rpx;
      font-size: 20rpx;
      color: $uni-text-color-placeholder;
    }

    &__right {
      text-align: right;
    }

    &__amount {
      display: block;
      font-size: 30rpx;
      font-weight: 600;

      &--in {
        color: $uni-color-success;
      }

      &--out {
        color: $uni-text-color;
      }
    }

    &__balance {
      display: block;
      margin-top: 8rpx;
      font-size: 20rpx;
      color: $uni-text-color-grey;
    }
  }
</style>
