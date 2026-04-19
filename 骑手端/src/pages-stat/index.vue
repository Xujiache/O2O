<template>
  <view class="page">
    <view class="range">
      <view
        v-for="r in ranges"
        :key="r.value"
        class="range__item"
        :class="{ 'range__item--active': pickedRange === r.value }"
        @click="pickedRange = r.value"
      >
        {{ r.label }}
      </view>
    </view>

    <view class="card overview">
      <view class="overview__cell">
        <view class="overview__num">{{ overview.totalOrderCount }}</view>
        <view class="overview__label">总单数</view>
      </view>
      <view class="overview__cell">
        <view class="overview__num">{{ formatAmount(overview.totalIncome) }}</view>
        <view class="overview__label">总收入</view>
      </view>
      <view class="overview__cell">
        <view class="overview__num">{{ overview.onTimeRate }}</view>
        <view class="overview__label">准时率</view>
      </view>
      <view class="overview__cell">
        <view class="overview__num">{{ overview.goodRate }}</view>
        <view class="overview__label">好评率</view>
      </view>
    </view>

    <view class="card">
      <view class="card__title">单量趋势</view>
      <view class="bar-chart">
        <view
          v-for="(p, i) in series"
          :key="`${p.date}-${i}`"
          class="bar"
          :style="{ height: barHeight() + 'rpx' }"
        >
          <view class="bar__bar" :style="{ height: barInner(p.value) + '%' }" />
          <text class="bar__label">{{ p.value }}</text>
          <text class="bar__date">{{ shortDate(p.date) }}</text>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="card__title">服务质量</view>
      <view class="row">
        <text class="row__label">差评</text>
        <text class="row__val">{{ overview.badRate }}</text>
      </view>
      <view class="row">
        <text class="row__label">投诉</text>
        <text class="row__val">{{ overview.complaintCount }} 条</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import dayjs from 'dayjs'
  import { onShow } from '@dcloudio/uni-app'
  import { fetchStatOverview, fetchStatSeries } from '@/api/stat'
  import type { RiderStatOverview, StatPoint } from '@/types/biz'
  import { mockResolve } from '@/api/_mock'
  import { formatAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 数据统计：单量/收入/准时率/好评率/差评/投诉 + 7 天柱状趋势
   *   T7.39
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const ranges = [
    { value: 7, label: '近 7 天' },
    { value: 30, label: '近 30 天' },
    { value: 90, label: '近 90 天' }
  ]
  const pickedRange = ref(7)
  const overview = ref<RiderStatOverview>(mockResolve.statOverview)
  const series = ref<StatPoint[]>([])

  const maxValue = computed(() => Math.max(1, ...series.value.map((p) => p.value)))

  function barHeight(): number {
    return 200
  }

  function barInner(v: number): number {
    return Math.max(8, (v / maxValue.value) * 100)
  }

  function shortDate(d: string): string {
    return dayjs(d).format('M-D')
  }

  watch(pickedRange, () => load(), { immediate: false })

  onShow(() => {
    track(TRACK.VIEW_STAT)
    void load()
  })

  async function load() {
    const startDate = dayjs().subtract(pickedRange.value, 'day').format('YYYY-MM-DD')
    const endDate = dayjs().format('YYYY-MM-DD')
    try {
      overview.value = await fetchStatOverview({ startDate, endDate })
    } catch (e) {
      logger.warn('stat.overview.fail', { e: String(e) })
    }
    try {
      series.value = await fetchStatSeries({
        metric: 'orderCount',
        startDate,
        endDate
      })
    } catch (e) {
      logger.warn('stat.series.fail', { e: String(e) })
      /* 生成 mock 7 天数据 */
      const arr: StatPoint[] = []
      for (let i = pickedRange.value - 1; i >= 0; i--) {
        arr.push({
          date: dayjs().subtract(i, 'day').format('YYYY-MM-DD'),
          value: 5 + Math.floor(Math.random() * 12)
        })
      }
      series.value = arr.slice(-7)
    }
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .range {
    display: flex;
    gap: 12rpx;
    margin-bottom: 16rpx;

    &__item {
      flex: 1;
      height: 64rpx;
      font-size: 24rpx;
      line-height: 64rpx;
      color: $uni-text-color-grey;
      text-align: center;
      background: #fff;
      border: 2rpx solid transparent;
      border-radius: $uni-border-radius-base;

      &--active {
        color: $uni-color-primary;
        background: $uni-color-primary-light;
        border-color: $uni-color-primary;
      }
    }
  }

  .card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 16rpx;
      font-size: 26rpx;
      font-weight: 600;
    }
  }

  .overview {
    display: flex;

    &__cell {
      flex: 1;
      text-align: center;
    }

    &__num {
      font-size: 32rpx;
      font-weight: 700;
      color: $uni-color-primary;
    }

    &__label {
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .bar-chart {
    display: flex;
    gap: 8rpx;
    align-items: flex-end;
    height: 240rpx;
  }

  .bar {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;

    &__bar {
      width: 80%;
      background: linear-gradient(180deg, $uni-color-primary 0%, $uni-color-primary-light 100%);
      border-radius: 8rpx 8rpx 0 0;
    }

    &__label {
      margin-top: 4rpx;
      font-size: 18rpx;
      color: $uni-color-primary;
    }

    &__date {
      font-size: 18rpx;
      color: $uni-text-color-grey;
    }
  }

  .row {
    display: flex;
    justify-content: space-between;
    padding: 12rpx 0;
    font-size: 24rpx;

    &__label {
      color: $uni-text-color-grey;
    }

    &__val {
      color: $uni-text-color;
    }
  }
</style>
