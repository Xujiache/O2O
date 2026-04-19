<template>
  <view class="page rl">
    <view class="rl__head">
      <view class="rl__score">
        <text class="rl__score-val">{{ scoreAvgText }}</text>
        <text class="rl__score-label">综合评分</text>
      </view>
      <view class="rl__counts">
        <text class="rl__count-line">总评 {{ stat?.total ?? 0 }}</text>
        <text class="rl__count-line">好评 {{ stat?.goodCount ?? 0 }}</text>
        <text class="rl__count-line">中差评 {{ midPlusBad }}</text>
      </view>
    </view>

    <view v-if="(stat?.tags?.length ?? 0) > 0" class="rl__tag-cloud">
      <view
        v-for="t in stat?.tags ?? []"
        :key="t.name"
        class="rl__tag"
        :class="{ 'rl__tag--bad': t.type === 'bad' }"
      >
        <text>{{ t.name }} {{ t.count }}</text>
      </view>
    </view>

    <view class="rl__tabs">
      <view
        v-for="(tb, i) in tabs"
        :key="tb.value"
        class="rl__tab"
        :class="{ 'rl__tab--active': activeTab === i }"
        @tap="onTabChange(i)"
      >
        <text>{{ tb.label }}</text>
      </view>
    </view>

    <BizLoading v-if="loading && reviews.length === 0" />
    <BizEmpty v-else-if="!loading && reviews.length === 0" text="暂无评价" />
    <scroll-view v-else scroll-y class="rl__scroll" @scrolltolower="onLoadMore">
      <view v-for="r in reviews" :key="r.id" class="rl__card">
        <view class="rl__card-head">
          <image class="rl__avatar" :src="r.userAvatar ?? defaultAvatar" mode="aspectFill" />
          <view class="rl__card-name">
            <text class="rl__nickname">{{ r.userNickname }}</text>
            <view class="rl__stars">
              <text
                v-for="i in 5"
                :key="`s_${r.id}_${i}`"
                class="rl__star"
                :class="{ 'rl__star--on': i <= r.shopRating }"
              >
                ★
              </text>
            </view>
          </view>
          <text class="rl__time">{{ formatTime(r.createdAt, 'MM-DD') }}</text>
        </view>

        <text v-if="r.content" class="rl__content">{{ r.content }}</text>

        <view v-if="(r.images?.length ?? 0) > 0" class="rl__images">
          <image
            v-for="(img, j) in r.images"
            :key="`img_${r.id}_${j}`"
            class="rl__image"
            :src="img"
            mode="aspectFill"
            @tap="onPreview(r.images, j)"
          />
        </view>

        <view v-if="(r.tags?.length ?? 0) > 0" class="rl__r-tags">
          <text v-for="t in r.tags" :key="`t_${r.id}_${t}`" class="rl__r-tag">{{ t }}</text>
        </view>

        <view v-if="r.reply" class="rl__reply">
          <text class="rl__reply-label">商家回复：</text>
          <text class="rl__reply-content">{{ r.reply }}</text>
        </view>
      </view>

      <view class="rl__more">
        <text>{{ hasMore ? (loading ? '加载中...' : '上拉加载更多') : '—— 没有更多了 ——' }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-takeout/review-list.vue
   * @stage P5/T5.20 (Sprint 3)
   * @desc 店铺评价列表：顶部统计 + 标签云 + Tab 切换 + keyset 分页
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import { listReviews, getReviewStat } from '@/api/shop'
  import type { Review } from '@/types/biz'
  import { formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'

  type RatingFilter = 0 | 1 | 2 | 3
  interface Tab {
    label: string
    value: string
    rating: RatingFilter
    hasImage?: 0 | 1
  }

  const tabs: Tab[] = [
    { label: '全部', value: 'all', rating: 0 },
    { label: '好评', value: 'good', rating: 1 },
    { label: '中评', value: 'mid', rating: 2 },
    { label: '差评', value: 'bad', rating: 3 },
    { label: '带图', value: 'image', rating: 0, hasImage: 1 }
  ]

  const defaultAvatar = 'https://cdn.uviewui.com/uview/album/1.jpg'

  const shopId = ref<string>('')
  const activeTab = ref<number>(0)
  const reviews = ref<Review[]>([])
  const loading = ref<boolean>(false)
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)
  const stat = ref<{
    total: number
    scoreAvg: string
    goodCount: number
    midCount: number
    badCount: number
    tags: Array<{ name: string; count: number; type: 'good' | 'bad' }>
  } | null>(null)

  const scoreAvgText = computed<string>(() => {
    if (!stat.value) return '5.0'
    const n = Number(stat.value.scoreAvg)
    if (Number.isNaN(n)) return '5.0'
    return n.toFixed(1)
  })

  const midPlusBad = computed<number>(() => {
    if (!stat.value) return 0
    return stat.value.midCount + stat.value.badCount
  })

  onLoad((options) => {
    const sid = (options?.shopId as string) ?? ''
    if (!sid) {
      uni.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    shopId.value = sid
    void loadStat()
    void load(true)
  })

  async function loadStat() {
    try {
      stat.value = await getReviewStat(shopId.value)
    } catch (e) {
      logger.warn('review.stat.fail', { e: String(e) })
    }
  }

  async function load(reset = false) {
    if (reset) {
      cursor.value = null
      hasMore.value = true
      reviews.value = []
    }
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const cur = tabs[activeTab.value]
      const r = await listReviews({
        shopId: shopId.value,
        rating: cur.rating,
        hasImage: cur.hasImage,
        cursor: cursor.value ?? undefined,
        pageSize: 20
      })
      reviews.value = reset ? r.list : [...reviews.value, ...r.list]
      cursor.value = r.nextCursor ?? null
      hasMore.value = r.hasMore
    } catch (e) {
      logger.warn('review.list.fail', { e: String(e), shopId: shopId.value })
    } finally {
      loading.value = false
    }
  }

  function onTabChange(i: number) {
    activeTab.value = i
    void load(true)
  }

  function onLoadMore() {
    void load(false)
  }

  function onPreview(urls: string[], i: number) {
    uni.previewImage({ urls, current: urls[i] })
  }
</script>

<style lang="scss" scoped>
  .rl {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $color-bg-page;

    &__head {
      display: flex;
      gap: 32rpx;
      padding: 32rpx 32rpx 24rpx;
      background: $color-bg-white;
    }

    &__score {
      display: flex;
      flex-direction: column;
      gap: 8rpx;
      align-items: center;
      justify-content: center;
      min-width: 200rpx;
      padding: 16rpx 24rpx;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-md;
    }

    &__score-val {
      font-size: 56rpx;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__score-label {
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__counts {
      display: flex;
      flex-direction: column;
      gap: 8rpx;
      justify-content: center;
    }

    &__count-line {
      font-size: $font-size-sm;
      color: $color-text-regular;
    }

    &__tag-cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 16rpx;
      padding: 0 32rpx 24rpx;
      background: $color-bg-white;
    }

    &__tag {
      padding: 8rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-xl;

      &--bad {
        color: $color-danger;
        background: rgba(245, 108, 108, 0.08);
      }
    }

    &__tabs {
      display: flex;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;
      border-bottom: 1rpx solid $color-divider;
    }

    &__tab {
      flex: 1;
      padding: 24rpx 0;
      font-size: $font-size-sm;
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

    &__card {
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__card-head {
      display: flex;
      gap: 16rpx;
      align-items: center;
    }

    &__avatar {
      width: 72rpx;
      height: 72rpx;
      background: $color-bg-page;
      border-radius: $radius-circle;
    }

    &__card-name {
      flex: 1;
      min-width: 0;
    }

    &__nickname {
      @include ellipsis(1);

      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__stars {
      display: flex;
      gap: 4rpx;
      margin-top: 4rpx;
    }

    &__star {
      font-size: $font-size-sm;
      color: $color-divider;

      &--on {
        color: $color-warning;
      }
    }

    &__time {
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__content {
      display: block;
      padding: 16rpx 0 0;
      font-size: $font-size-base;
      line-height: 1.6;
      color: $color-text-regular;
    }

    &__images {
      display: flex;
      flex-wrap: wrap;
      gap: 12rpx;
      margin-top: 16rpx;
    }

    &__image {
      width: 160rpx;
      height: 160rpx;
      background: $color-bg-page;
      border-radius: $radius-sm;
    }

    &__r-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 12rpx;
      margin-top: 16rpx;
    }

    &__r-tag {
      padding: 4rpx 16rpx;
      font-size: $font-size-xs;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-sm;
    }

    &__reply {
      padding: 16rpx;
      margin-top: 16rpx;
      font-size: $font-size-sm;
      color: $color-text-regular;
      background: $color-bg-page;
      border-radius: $radius-sm;
    }

    &__reply-label {
      color: $color-text-primary;
    }

    &__more {
      padding: 32rpx 0;
      font-size: $font-size-xs;
      color: $color-text-secondary;
      text-align: center;
    }
  }
</style>
