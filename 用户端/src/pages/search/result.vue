<template>
  <view class="page page-result">
    <view class="result__bar">
      <view class="result__back" @tap="onBack">
        <text class="result__back-icon">‹</text>
      </view>
      <view class="result__input-wrap" @tap="onEdit">
        <text class="result__icon">🔍</text>
        <text class="result__kw u-line-1">{{ q }}</text>
      </view>
      <view class="result__re" @tap="onEdit">
        <text class="result__re-text">修改</text>
      </view>
    </view>

    <view class="result__tabs">
      <u-tabs
        :list="tabs"
        :current="activeTabIdx"
        line-color="#ff6a1a"
        :line-width="40"
        :scrollable="false"
        :active-style="{ color: '#ff6a1a', fontWeight: 500 }"
        :inactive-style="{ color: '#666' }"
        @click="onTabClick"
      />
    </view>

    <scroll-view scroll-y class="result__scroll" @scrolltolower="onScrollToLower">
      <BizLoading v-if="loading && list.length === 0" text="搜索中..." />
      <BizError
        v-else-if="error && list.length === 0"
        title="搜索失败"
        desc="请稍后重试"
        @retry="reload"
      />
      <BizEmpty
        v-else-if="!loading && list.length === 0"
        :text="`未找到与「${q}」相关的${currentTabName}`"
      />
      <view v-else class="result__list">
        <view
          v-for="shop in list"
          :key="shop.id"
          class="result__card card"
          @tap="onShopClick(shop.id)"
        >
          <image
            class="result__cover"
            :src="shop.cover || shop.logo || PLACEHOLDER_IMG"
            mode="aspectFill"
            lazy-load
          />
          <view class="result__body">
            <view class="result__title-row">
              <view class="result__name u-line-1">
                <text v-for="(seg, i) in highlight(shop.name)" :key="i" :class="seg.cls">
                  {{ seg.text }}
                </text>
              </view>
              <text v-if="shop.distance >= 0" class="result__distance">
                {{ formatDistance(shop.distance) }}
              </text>
            </view>
            <view class="result__meta-row">
              <text class="result__score">★ {{ shop.scoreAvg || '5.0' }}</text>
              <text class="result__sales">月售 {{ shop.monthSales || 0 }}</text>
            </view>
            <view class="result__fee-row">
              <text>起送 {{ formatAmount(shop.minAmount) }}</text>
              <text class="result__divider">·</text>
              <text>配送费 {{ formatAmount(shop.deliveryFee) }}</text>
            </view>
          </view>
        </view>

        <view class="result__footer">
          <view v-if="loading">
            <text class="result__footer-text">加载中...</text>
          </view>
          <view v-else-if="hasMore" class="result__loadmore" @tap="loadMore">
            <text class="result__footer-text">加载更多</text>
          </view>
          <view v-else>
            <text class="result__footer-text">— 没有更多了 —</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/search/result.vue
   * @stage P5/T5.14 (Sprint 2)
   * @desc 搜索结果页：店铺/商品/跑腿 3 Tab；keyset 分页（pageSize 20）；关键词高亮
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import BizError from '@/components/biz/BizError.vue'
  import { listShops, type ShopListParams } from '@/api/shop'
  import type { Shop, KeysetPageResult, PageResult } from '@/types/biz'
  import { useLocationStore } from '@/store/location'
  import { formatAmount, formatDistance } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /** 默认占位图 */
  const PLACEHOLDER_IMG = 'https://cdn.uviewui.com/uview/empty/list.png'
  const PAGE_SIZE = 20

  /** 结果 Tab */
  type ResultType = 'shop' | 'product' | 'errand'
  const tabs = ref<Array<{ name: string; type: ResultType }>>([
    { name: '店铺', type: 'shop' },
    { name: '商品', type: 'product' },
    { name: '跑腿', type: 'errand' }
  ])

  const locationStore = useLocationStore()

  const q = ref<string>('')
  const activeTabIdx = ref<number>(0)
  const list = ref<Shop[]>([])
  const cursor = ref<string | null>(null)
  const page = ref<number>(1)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)
  const error = ref<boolean>(false)

  /** 当前 Tab 名（用于空态文案） */
  const currentTabName = computed<string>(() => tabs.value[activeTabIdx.value]?.name ?? '结果')

  onLoad((options) => {
    const param = options ?? {}
    const incoming = (param.q ?? '').toString()
    if (!incoming) {
      uni.showToast({ title: '关键词为空', icon: 'none' })
      uni.redirectTo({ url: '/pages/search/index' })
      return
    }
    q.value = decodeURIComponent(incoming)
    const tabType = (param.type ?? 'shop').toString() as ResultType
    const idx = tabs.value.findIndex((t) => t.type === tabType)
    activeTabIdx.value = idx >= 0 ? idx : 0
    track(TRACK.SEARCH_SUBMIT, { q: q.value, type: tabType })
    void reload()
  })

  /**
   * Tab 切换
   */
  function onTabClick(item: { name: string }): void {
    const idx = tabs.value.findIndex((t) => t.name === item.name)
    if (idx < 0 || idx === activeTabIdx.value) return
    activeTabIdx.value = idx
    void reload()
  }

  /**
   * 重新加载（关键词变 / 切 Tab / 重试）
   */
  async function reload(): Promise<void> {
    list.value = []
    cursor.value = null
    page.value = 1
    hasMore.value = true
    error.value = false
    await fetchPage()
  }

  /**
   * 加载下一页
   */
  async function loadMore(): Promise<void> {
    if (loading.value || !hasMore.value) return
    page.value += 1
    await fetchPage()
  }

  /**
   * 拉取一页结果
   * 当前 product/errand 后端接口未导出对应方法，统一走 listShops 兜底
   * （由 Cascade 后续 Sprint 替换为真实接口；不阻塞 V5.2 keyset 分页验收）
   */
  async function fetchPage(): Promise<void> {
    if (loading.value) return
    loading.value = true
    error.value = false
    try {
      const params: ShopListParams = {
        q: q.value,
        cityCode: locationStore.city?.cityCode,
        lng: locationStore.coord?.lng,
        lat: locationStore.coord?.lat,
        page: page.value,
        pageSize: PAGE_SIZE,
        cursor: cursor.value ?? undefined
      }
      const r = await listShops(params)
      const items = extractList(r)
      list.value = page.value === 1 ? items : [...list.value, ...items]
      hasMore.value = computeHasMore(r, items.length)
      if ('nextCursor' in r) {
        cursor.value = r.nextCursor ?? null
      }
    } catch (e) {
      error.value = true
      logger.warn('search.result.fail', { e: String(e), q: q.value })
    } finally {
      loading.value = false
    }
  }

  /**
   * 兼容 PageResult / KeysetPageResult
   */
  function extractList(r: PageResult<Shop> | KeysetPageResult<Shop>): Shop[] {
    if (r && Array.isArray((r as PageResult<Shop>).list)) {
      return (r as PageResult<Shop>).list
    }
    return []
  }

  /**
   * 计算 hasMore
   */
  function computeHasMore(r: PageResult<Shop> | KeysetPageResult<Shop>, pageLen: number): boolean {
    if (r && 'hasMore' in r && typeof r.hasMore === 'boolean') return r.hasMore
    if (r && 'meta' in r && r.meta) return page.value < r.meta.totalPages
    return pageLen >= PAGE_SIZE
  }

  /**
   * 滚动到底
   */
  function onScrollToLower(): void {
    void loadMore()
  }

  /**
   * 关键词高亮：将 name 中匹配 q 的子串包成 highlight 段
   * @param name 店铺名
   * @returns Array<{ text, cls }> 渲染段
   */
  function highlight(name: string): Array<{ text: string; cls: string }> {
    const text = name ?? ''
    const kw = q.value
    if (!kw) return [{ text, cls: 'result__name-normal' }]
    const idx = text.toLowerCase().indexOf(kw.toLowerCase())
    if (idx < 0) return [{ text, cls: 'result__name-normal' }]
    return [
      { text: text.slice(0, idx), cls: 'result__name-normal' },
      { text: text.slice(idx, idx + kw.length), cls: 'result__name-hl' },
      { text: text.slice(idx + kw.length), cls: 'result__name-normal' }
    ]
  }

  /**
   * 跳店铺详情
   */
  function onShopClick(id: string): void {
    uni.navigateTo({
      url: `/pages-takeout/shop-detail?shopId=${encodeURIComponent(id)}`
    })
  }

  /**
   * 修改关键词 → 返回搜索页
   */
  function onEdit(): void {
    uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/search/index' }) })
  }

  /**
   * 返回上一页
   */
  function onBack(): void {
    uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/index/index' }) })
  }
</script>

<style lang="scss" scoped>
  .page-result {
    min-height: 100vh;
    background: $color-bg-page;
  }

  .result {
    &__bar {
      display: flex;
      gap: 16rpx;
      align-items: center;
      padding: 16rpx 24rpx;
      background: $color-bg-white;
    }

    &__back {
      @include flex-center;

      width: 56rpx;
      height: 56rpx;
    }

    &__back-icon {
      font-size: 48rpx;
      line-height: 1;
      color: $color-text-primary;
    }

    &__input-wrap {
      display: flex;
      flex: 1;
      gap: 8rpx;
      align-items: center;
      height: 64rpx;
      padding: 0 20rpx;
      background: $color-bg-page;
      border-radius: 32rpx;
    }

    &__icon {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__kw {
      flex: 1;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__re {
      flex-shrink: 0;
      padding: 0 8rpx;
    }

    &__re-text {
      font-size: $font-size-sm;
      color: $color-primary;
    }

    &__tabs {
      padding: 0 24rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;
    }

    &__scroll {
      box-sizing: border-box;
      height: calc(100vh - 200rpx);
    }

    &__list {
      padding: 16rpx 24rpx 48rpx;
    }

    &__card {
      display: flex;
      gap: 20rpx;
      padding: 20rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__cover {
      flex-shrink: 0;
      width: 160rpx;
      height: 160rpx;
      background: $color-bg-page;
      border-radius: $radius-sm;
    }

    &__body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 8rpx;
      min-width: 0;
    }

    &__title-row {
      display: flex;
      gap: 12rpx;
      align-items: center;
      justify-content: space-between;
    }

    &__name {
      flex: 1;
      min-width: 0;
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__name-normal {
      color: $color-text-primary;
    }

    &__name-hl {
      color: $color-primary;
    }

    &__distance {
      flex-shrink: 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__meta-row {
      display: flex;
      gap: 16rpx;
      align-items: center;
      font-size: $font-size-sm;
    }

    &__score {
      color: $color-warning;
    }

    &__sales {
      color: $color-text-secondary;
    }

    &__fee-row {
      display: flex;
      gap: 8rpx;
      align-items: center;
      font-size: $font-size-sm;
      color: $color-text-regular;
    }

    &__divider {
      color: $color-text-placeholder;
    }

    &__footer {
      @include flex-center;

      padding: 32rpx 0;
    }

    &__footer-text {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__loadmore {
      padding: 16rpx 64rpx;
      background: $color-bg-white;
      border-radius: $radius-lg;
    }
  }
</style>
