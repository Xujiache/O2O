<template>
  <view class="page page-rl">
    <!-- 评价统计 -->
    <view class="rl-stat">
      <view class="rl-stat__cell">
        <text class="rl-stat__num">{{ stat.scoreAvg }}</text>
        <text class="rl-stat__label">均分</text>
      </view>
      <view class="rl-stat__cell">
        <text class="rl-stat__num">{{ stat.total }}</text>
        <text class="rl-stat__label">总评价</text>
      </view>
      <view class="rl-stat__cell">
        <text class="rl-stat__num">{{ stat.unrepliedCount }}</text>
        <text class="rl-stat__label">待回复</text>
      </view>
    </view>

    <!-- 筛选 -->
    <view class="rl-tabs">
      <view
        v-for="t in tabs"
        :key="t.key"
        class="rl-tab"
        :class="{ 'rl-tab--active': curTab === t.key }"
        @click="onTabChange(t.key)"
      >
        {{ t.label }}
      </view>
    </view>

    <!-- 列表 -->
    <scroll-view scroll-y class="rl-list" @scrolltolower="loadMore">
      <view v-for="r in reviews" :key="r.id" class="rl-item">
        <view class="rl-item__header row-between">
          <view class="row">
            <view class="rl-avatar">{{ (r.userNickname || '匿').charAt(0) }}</view>
            <view class="col">
              <text class="rl-item__name">{{ r.userNickname }}</text>
              <text class="rl-item__time">{{ formatDate(r.createdAt) }}</text>
            </view>
          </view>
          <view class="rl-rating">
            <text
              v-for="i in 5"
              :key="i"
              class="rl-rating__star"
              :class="{ 'rl-rating__star--on': i <= r.shopRating }"
              >★</text
            >
          </view>
        </view>
        <text class="rl-item__content">{{ r.content }}</text>
        <view v-if="r.tags && r.tags.length" class="rl-tags">
          <text v-for="tag in r.tags" :key="tag" class="rl-tag">{{ tag }}</text>
        </view>
        <view v-if="r.reply" class="rl-reply">
          <text class="rl-reply__label">店铺回复：</text>
          <text>{{ r.reply }}</text>
        </view>
        <view class="rl-item__actions">
          <BizBtn v-if="!r.reply" type="primary" text="回复" @click="goReply(r.id)" />
          <BizBtn v-if="!r.appealing" type="warning" text="申诉" @click="goAppeal(r.id)" />
        </view>
      </view>

      <BizEmpty v-if="!loading && reviews.length === 0" title="暂无评价" scene="review" />
      <BizLoading v-if="loading" />
      <view v-if="!hasMore && reviews.length > 0" class="rl-end">没有更多了</view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, onMounted } from 'vue'
  import { useShopStore } from '@/store'
  import type { MerchantReview } from '@/types/biz'
  import { listReviews, getReviewStat } from '@/api/shop'
  import { mockEnabled, delay } from '@/api/_mock'
  import { formatDate } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 评价管理列表（T6.16）
   *
   * Tab：全部 / 待回复 / 好评 / 差评
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.16)
   */
  const shopStore = useShopStore()

  const tabs = [
    { key: 'all', label: '全部' },
    { key: 'unreplied', label: '待回复' },
    { key: 'good', label: '好评' },
    { key: 'bad', label: '差评' }
  ] as const
  type TabKey = (typeof tabs)[number]['key']
  const curTab = ref<TabKey>('all')

  const stat = reactive({
    total: 0,
    scoreAvg: '0.0',
    goodCount: 0,
    midCount: 0,
    badCount: 0,
    unrepliedCount: 0
  })

  const reviews = ref<MerchantReview[]>([])
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)

  onMounted(async () => {
    if (!shopStore.currentShopId) {
      uni.showToast({ title: '请先选择店铺', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
      return
    }
    await loadStat()
    await refresh()
  })

  async function loadStat() {
    try {
      if (mockEnabled()) {
        Object.assign(stat, {
          total: 128,
          scoreAvg: '4.8',
          goodCount: 110,
          midCount: 12,
          badCount: 6,
          unrepliedCount: 5
        })
      } else {
        const r = await getReviewStat(shopStore.currentShopId)
        Object.assign(stat, r)
      }
    } catch (e) {
      logger.warn('rl.stat.fail', { e: String(e) })
    }
  }

  function onTabChange(k: TabKey) {
    if (curTab.value === k) return
    curTab.value = k
    void refresh()
  }

  async function refresh() {
    cursor.value = null
    hasMore.value = true
    reviews.value = []
    await loadMore()
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      const params = {
        shopId: shopStore.currentShopId,
        unreplied: curTab.value === 'unreplied' ? (1 as const) : undefined,
        ratingMin:
          curTab.value === 'good'
            ? (4 as const)
            : curTab.value === 'bad'
              ? (1 as const)
              : undefined,
        ratingMax: curTab.value === 'bad' ? (2 as const) : undefined,
        cursor: cursor.value,
        limit: 20
      }
      if (mockEnabled()) {
        const r = await delay({
          list: genMockReviews(),
          nextCursor: null,
          hasMore: false
        })
        reviews.value.push(...r.list)
        cursor.value = r.nextCursor
        hasMore.value = r.hasMore
      } else {
        const r = await listReviews(params)
        reviews.value.push(...r.list)
        cursor.value = r.nextCursor
        hasMore.value = r.hasMore
      }
    } catch (e) {
      logger.warn('rl.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function genMockReviews(): MerchantReview[] {
    return [
      {
        id: 'rv-1',
        orderNo: 'TO20260418001',
        shopId: shopStore.currentShopId,
        userId: 'u-1',
        userNickname: '张***',
        userAvatar: null,
        shopRating: 5,
        productRating: 5,
        deliveryRating: 5,
        content: '味道很好，配送也快，下次还会来！',
        images: [],
        tags: ['味道好', '速度快', '分量足'],
        createdAt: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 'rv-2',
        orderNo: 'TO20260418002',
        shopId: shopStore.currentShopId,
        userId: 'u-2',
        userNickname: '李***',
        userAvatar: null,
        shopRating: 2,
        productRating: 3,
        deliveryRating: 1,
        content: '送得太慢了，菜都凉了',
        images: [],
        tags: ['配送慢'],
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
      }
    ]
  }

  function goReply(id: string) {
    uni.navigateTo({ url: `/pages-shop/review-reply?id=${id}` })
  }
  function goAppeal(id: string) {
    uni.navigateTo({ url: `/pages-shop/review-appeal?id=${id}` })
  }
</script>

<style lang="scss" scoped>
  .page-rl {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $uni-bg-color-grey;
  }

  .rl-stat {
    display: flex;
    padding: 24rpx 0;
    background: #fff;

    &__cell {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
    }

    &__num {
      font-size: 32rpx;
      font-weight: 600;
      color: $uni-color-primary;
    }

    &__label {
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .rl-tabs {
    display: flex;
    padding: 0 24rpx;
    background: #fff;
    border-top: 1rpx solid $uni-border-color;
  }

  .rl-tab {
    flex: 1;
    padding: 24rpx 0;
    font-size: 26rpx;
    color: $uni-text-color-grey;
    text-align: center;

    &--active {
      font-weight: 500;
      color: $uni-color-primary;
      border-bottom: 4rpx solid $uni-color-primary;
    }
  }

  .rl-list {
    flex: 1;
    padding: 16rpx 24rpx;
  }

  .rl-item {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__header {
      margin-bottom: 16rpx;
    }

    &__name {
      font-size: 26rpx;
      color: $uni-text-color;
    }

    &__time {
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__content {
      display: block;
      margin-bottom: 12rpx;
      font-size: 26rpx;
      line-height: 1.6;
      color: $uni-text-color;
    }

    &__actions {
      display: flex;
      gap: 16rpx;
      justify-content: flex-end;
      margin-top: 16rpx;
    }
  }

  .rl-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64rpx;
    height: 64rpx;
    margin-right: 16rpx;
    font-size: 28rpx;
    color: #fff;
    background: $uni-color-primary;
    border-radius: 50%;
  }

  .rl-rating {
    display: flex;

    &__star {
      font-size: 24rpx;
      color: $uni-text-color-disable;

      &--on {
        color: $uni-color-warning;
      }
    }
  }

  .rl-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8rpx;
    margin-bottom: 12rpx;
  }

  .rl-tag {
    padding: 4rpx 12rpx;
    font-size: 22rpx;
    color: $uni-color-primary;
    background: $uni-color-primary-light;
    border-radius: 999rpx;
  }

  .rl-reply {
    padding: 16rpx;
    margin-top: 12rpx;
    font-size: 24rpx;
    line-height: 1.6;
    color: $uni-text-color-grey;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;

    &__label {
      font-weight: 500;
      color: $uni-color-primary;
    }
  }

  .rl-end {
    padding: 32rpx;
    font-size: 22rpx;
    color: $uni-text-color-placeholder;
    text-align: center;
  }
</style>
