<template>
  <view class="page page-stat">
    <view class="stat-range">
      <text
        v-for="r in ranges"
        :key="r.key"
        class="stat-range__item"
        :class="{ 'stat-range__item--active': curRange === r.key }"
        @click="onRangeChange(r.key)"
        >{{ r.label }}</text
      >
    </view>

    <view class="stat-overview">
      <view class="stat-cell">
        <text class="stat-cell__num">{{ formatAmount(overview.totalSales, '') }}</text>
        <text class="stat-cell__label">总销售额</text>
      </view>
      <view class="stat-cell">
        <text class="stat-cell__num">{{ overview.totalOrderCount }}</text>
        <text class="stat-cell__label">总订单数</text>
      </view>
      <view class="stat-cell">
        <text class="stat-cell__num">{{ formatAmount(overview.avgOrderValue, '') }}</text>
        <text class="stat-cell__label">客单价</text>
      </view>
      <view class="stat-cell">
        <text class="stat-cell__num">{{ overview.uv }}</text>
        <text class="stat-cell__label">UV</text>
      </view>
    </view>

    <view class="stat-section">
      <text class="stat-h2">销售趋势（折线）</text>
      <BizStatChart :data="salesChart" :loading="salesLoading" />
    </view>

    <view class="stat-section">
      <text class="stat-h2">商品销量榜（Top 5）</text>
      <view v-if="rankList.length === 0 && !rankLoading" class="stat-empty">暂无数据</view>
      <view v-else class="stat-rank">
        <view v-for="(r, idx) in rankList" :key="r.productId" class="stat-rank__row">
          <text class="stat-rank__num">{{ idx + 1 }}</text>
          <text class="stat-rank__name">{{ r.productName }}</text>
          <view class="stat-rank__bar">
            <view class="stat-rank__fill" :style="{ width: `${(r.saleCount / maxSale) * 100}%` }" />
          </view>
          <text class="stat-rank__val">{{ r.saleCount }}</text>
        </view>
      </view>
    </view>

    <view class="stat-section">
      <text class="stat-h2">类目分布（饼图代占）</text>
      <view class="stat-pie">
        <view v-for="(c, idx) in categoryShare" :key="c.name" class="stat-pie__item">
          <view class="stat-pie__color" :style="{ background: pieColor(idx) }" />
          <text class="stat-pie__name">{{ c.name }}</text>
          <text class="stat-pie__val">{{ c.value }}%</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, computed, onMounted } from 'vue'
  import { useShopStore } from '@/store'
  import type { ProductRankItem, StatPoint, StatOverview } from '@/types/biz'
  import { getStatOverview, getSalesTrend, getProductRank, getCategoryShare } from '@/api/stat'
  import { mockEnabled, mockStatOverview, mockSalesTrend, delay } from '@/api/_mock'
  import { formatAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 数据统计（T6.33）
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()

  const ranges = [
    { key: 1 as const, label: '今日' },
    { key: 2 as const, label: '近 7 天' },
    { key: 3 as const, label: '近 30 天' }
  ]
  const curRange = ref<1 | 2 | 3>(2)

  const overview = reactive<StatOverview>({
    startDate: '',
    endDate: '',
    totalSales: '0.00',
    totalOrderCount: 0,
    avgOrderValue: '0.00',
    uv: 0,
    conversionRate: '0.00'
  })

  const salesChart = ref<{ label: string; value: number }[]>([])
  const salesLoading = ref<boolean>(false)
  const rankList = ref<ProductRankItem[]>([])
  const rankLoading = ref<boolean>(false)
  const categoryShare = ref<{ name: string; value: number }[]>([])

  const maxSale = computed<number>(() => Math.max(1, ...rankList.value.map((r) => r.saleCount)))

  onMounted(async () => {
    track(TRACK.VIEW_STAT)
    await loadAll()
  })

  function onRangeChange(k: 1 | 2 | 3) {
    if (curRange.value === k) return
    curRange.value = k
    void loadAll()
  }

  async function loadAll() {
    await Promise.all([loadOverview(), loadSales(), loadRank(), loadCategoryShare()])
  }

  async function loadOverview() {
    try {
      const r = mockEnabled()
        ? await delay(mockStatOverview)
        : await getStatOverview({ shopId: shopStore.currentShopId, rangeType: curRange.value })
      Object.assign(overview, r)
    } catch (e) {
      logger.warn('stat.overview.fail', { e: String(e) })
    }
  }

  async function loadSales() {
    salesLoading.value = true
    try {
      const days = curRange.value === 1 ? 1 : curRange.value === 2 ? 7 : 30
      const points: StatPoint[] = mockEnabled()
        ? await delay(mockSalesTrend(days))
        : await getSalesTrend({ shopId: shopStore.currentShopId, rangeType: curRange.value })
      salesChart.value = points.map((p) => ({ label: p.date.slice(5), value: p.value }))
    } catch (e) {
      logger.warn('stat.sales.fail', { e: String(e) })
    } finally {
      salesLoading.value = false
    }
  }

  async function loadRank() {
    rankLoading.value = true
    try {
      rankList.value = mockEnabled()
        ? await delay([
            { productId: 'pd-1', productName: '黑椒牛柳饭', saleCount: 256, saleAmount: '7168.00' },
            {
              productId: 'pd-2',
              productName: '糖醋里脊套餐',
              saleCount: 198,
              saleAmount: '4356.00'
            },
            {
              productId: 'pd-3',
              productName: '番茄牛肉粒饭',
              saleCount: 132,
              saleAmount: '3960.00'
            }
          ] as ProductRankItem[])
        : await getProductRank({
            shopId: shopStore.currentShopId,
            rangeType: curRange.value,
            topN: 5
          })
    } catch (e) {
      logger.warn('stat.rank.fail', { e: String(e) })
    } finally {
      rankLoading.value = false
    }
  }

  async function loadCategoryShare() {
    try {
      categoryShare.value = mockEnabled()
        ? await delay([
            { name: '招牌', value: 45 },
            { name: '套餐', value: 30 },
            { name: '小食', value: 15 },
            { name: '饮品', value: 10 }
          ])
        : await getCategoryShare({ shopId: shopStore.currentShopId, rangeType: curRange.value })
    } catch (e) {
      logger.warn('stat.share.fail', { e: String(e) })
    }
  }

  function pieColor(idx: number): string {
    const colors = ['#2F80ED', '#52C41A', '#FA8C16', '#FF4D4F', '#722ED1', '#13C2C2']
    return colors[idx % colors.length]
  }
</script>

<style lang="scss" scoped>
  .page-stat {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .stat-range {
    display: flex;
    margin-bottom: 24rpx;
    overflow: hidden;
    background: #fff;
    border-radius: 16rpx;

    &__item {
      flex: 1;
      padding: 24rpx 0;
      font-size: 26rpx;
      color: $uni-text-color-grey;
      text-align: center;

      &--active {
        font-weight: 500;
        color: $uni-color-primary;
        background: $uni-color-primary-light;
      }
    }
  }

  .stat-overview {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16rpx;
    margin-bottom: 24rpx;
  }

  .stat-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24rpx;
    background: #fff;
    border-radius: 16rpx;

    &__num {
      font-size: 36rpx;
      font-weight: 600;
      color: $uni-color-primary;
    }

    &__label {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .stat-section {
    padding: 24rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .stat-h2 {
    display: block;
    margin-bottom: 16rpx;
    font-size: 26rpx;
    font-weight: 600;
  }

  .stat-empty {
    padding: 40rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
    text-align: center;
  }

  .stat-rank {
    &__row {
      display: flex;
      align-items: center;
      padding: 12rpx 0;
    }

    &__num {
      width: 48rpx;
      font-size: 24rpx;
      color: $uni-color-primary;
      text-align: center;
    }

    &__name {
      flex: 1;
      overflow: hidden;
      font-size: 24rpx;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__bar {
      width: 200rpx;
      height: 12rpx;
      margin: 0 16rpx;
      overflow: hidden;
      background: $uni-bg-color-grey;
      border-radius: 6rpx;
    }

    &__fill {
      height: 100%;
      background: $uni-color-primary;
    }

    &__val {
      width: 80rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
      text-align: right;
    }
  }

  .stat-pie {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16rpx;

    &__item {
      display: flex;
      align-items: center;
    }

    &__color {
      width: 24rpx;
      height: 24rpx;
      margin-right: 12rpx;
      border-radius: 50%;
    }

    &__name {
      flex: 1;
      font-size: 24rpx;
    }

    &__val {
      font-size: 24rpx;
      font-weight: 500;
      color: $uni-color-primary;
    }
  }
</style>
