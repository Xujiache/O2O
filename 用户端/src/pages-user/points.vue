<template>
  <view class="page points">
    <view class="points__hero">
      <text class="points__hero-label">可用积分</text>
      <text class="points__hero-num">{{ formatNumber(info?.available ?? 0) }}</text>
      <view class="points__hero-meta">
        <view class="points__hero-meta-item">
          <text class="points__hero-meta-label">即将过期</text>
          <text class="points__hero-meta-val">{{ formatNumber(info?.expiring ?? 0) }}</text>
        </view>
        <view class="points__hero-meta-divider" />
        <view class="points__hero-meta-item">
          <text class="points__hero-meta-label">累计获得</text>
          <text class="points__hero-meta-val">{{ formatNumber(info?.totalEarned ?? 0) }}</text>
        </view>
        <view class="points__hero-meta-divider" />
        <view class="points__hero-meta-item">
          <text class="points__hero-meta-label">累计消耗</text>
          <text class="points__hero-meta-val">{{ formatNumber(info?.totalSpent ?? 0) }}</text>
        </view>
      </view>
      <view class="points__exchange" @tap="onExchange">
        <text>积分兑换商品 ›</text>
      </view>
    </view>

    <view class="points__sec">
      <text class="points__sec-title">积分明细</text>
    </view>

    <BizLoading v-if="loading && flows.length === 0" />
    <BizEmpty v-else-if="!loading && flows.length === 0" text="暂无积分流水" />
    <scroll-view v-else scroll-y class="points__scroll" @scrolltolower="onLoadMore">
      <view v-for="f in flows" :key="f.id" class="points__flow">
        <view class="points__flow-main">
          <text class="points__flow-name">{{ bizTypeText(f.bizType) }}</text>
          <text
            class="points__flow-amount"
            :class="f.amount >= 0 ? 'points__flow-amount--gain' : 'points__flow-amount--lose'"
          >
            {{ f.amount >= 0 ? '+' : '' }}{{ f.amount }}
          </text>
        </view>
        <view class="points__flow-meta">
          <text class="points__flow-remark">{{ f.remark || '-' }}</text>
          <text class="points__flow-time">{{ formatTime(f.createdAt) }}</text>
        </view>
      </view>
      <view class="points__more">
        <text>{{ hasMore ? (loading ? '加载中...' : '上拉加载更多') : '—— 没有更多了 ——' }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/points.vue
   * @stage P5/T5.36 (Sprint 6)
   * @desc 积分中心：可用 / 即将过期 / 累计 + 流水分页
   * @author 单 Agent V2.0
   */
  import { ref } from 'vue'
  import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import { getPoints, getPointFlows } from '@/api/user'
  import { formatTime, formatNumber } from '@/utils/format'
  import { logger } from '@/utils/logger'

  interface PointsInfo {
    available: number
    expiring: number
    totalEarned: number
    totalSpent: number
  }
  interface PointFlow {
    id: string
    amount: number
    bizType: number
    remark: string
    createdAt: string
  }

  const info = ref<PointsInfo | null>(null)
  const flows = ref<PointFlow[]>([])
  const loading = ref<boolean>(false)
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)

  onShow(() => {
    void loadInfo()
    void loadFlows(true)
  })

  onPullDownRefresh(() => {
    void Promise.all([loadInfo(), loadFlows(true)]).finally(() => uni.stopPullDownRefresh())
  })

  async function loadInfo() {
    try {
      info.value = await getPoints()
    } catch (e) {
      logger.warn('points.info.fail', { e: String(e) })
    }
  }

  async function loadFlows(reset = false) {
    if (reset) {
      cursor.value = null
      hasMore.value = true
      flows.value = []
    }
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const r = await getPointFlows({ cursor: cursor.value ?? undefined, pageSize: 20 })
      flows.value = reset ? r.list : [...flows.value, ...r.list]
      const next = (r as unknown as { nextCursor?: string | null }).nextCursor
      cursor.value = next ?? null
      hasMore.value = r.list.length > 0 && Boolean(next)
    } catch (e) {
      logger.warn('points.flows.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function onLoadMore() {
    void loadFlows(false)
  }

  function onExchange() {
    uni.showToast({ title: '积分商城 V2 上线，敬请期待', icon: 'none' })
  }

  function bizTypeText(t: number): string {
    const map: Record<number, string> = {
      1: '下单获得',
      2: '签到奖励',
      3: '邀请奖励',
      4: '评价奖励',
      5: '兑换扣减',
      6: '过期清零',
      7: '系统调整'
    }
    return map[t] ?? `业务 #${t}`
  }
</script>

<style lang="scss" scoped>
  .points {
    display: flex;
    flex-direction: column;
    height: 100vh;

    &__hero {
      padding: 48rpx 32rpx;
      color: $color-text-inverse;
      background: linear-gradient(135deg, #ff6a1a 0%, #ff8e53 100%);
    }

    &__hero-label {
      display: block;
      font-size: $font-size-sm;
      color: rgba(255, 255, 255, 0.85);
    }

    &__hero-num {
      display: block;
      margin-top: 12rpx;
      font-size: 80rpx;
      font-weight: $font-weight-bold;
    }

    &__hero-meta {
      display: flex;
      padding: 24rpx 16rpx;
      margin-top: 24rpx;
      background: rgba(255, 255, 255, 0.15);
      border-radius: $radius-md;
    }

    &__hero-meta-item {
      flex: 1;
      text-align: center;
    }

    &__hero-meta-label {
      display: block;
      font-size: $font-size-xs;
      color: rgba(255, 255, 255, 0.85);
    }

    &__hero-meta-val {
      display: block;
      margin-top: 8rpx;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
    }

    &__hero-meta-divider {
      width: 1rpx;
      background: rgba(255, 255, 255, 0.3);
    }

    &__exchange {
      @include flex-center;

      width: 100%;
      height: 72rpx;
      margin-top: 24rpx;
      font-size: $font-size-base;
      color: $color-primary;
      background: $color-bg-white;
      border-radius: $radius-lg;
    }

    &__sec {
      padding: 24rpx 32rpx 16rpx;
    }

    &__sec-title {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__scroll {
      flex: 1;
      padding: 0 16rpx 16rpx;
    }

    &__flow {
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__flow-main {
      @include flex-between;
    }

    &__flow-name {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__flow-amount {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;

      &--gain {
        color: $color-success;
      }

      &--lose {
        color: $color-danger;
      }
    }

    &__flow-meta {
      @include flex-between;

      margin-top: 12rpx;
    }

    &__flow-remark {
      flex: 1;
      overflow: hidden;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__flow-time {
      flex-shrink: 0;
      margin-left: 16rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__more {
      padding: 32rpx 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }
  }
</style>
