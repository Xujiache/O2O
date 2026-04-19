<template>
  <view class="page favorites">
    <view class="favorites__tabs">
      <view
        v-for="(t, i) in tabs"
        :key="t.value"
        class="favorites__tab"
        :class="{ 'favorites__tab--active': activeTab === i }"
        @tap="onTabChange(i)"
      >
        <text>{{ t.label }}</text>
      </view>
    </view>

    <BizLoading v-if="loading && currentList.length === 0" />
    <BizEmpty v-else-if="!loading && currentList.length === 0" :text="emptyText" />
    <scroll-view v-else scroll-y class="favorites__scroll" @scrolltolower="onLoadMore">
      <template v-if="activeTab === 0">
        <view v-for="s in shops" :key="s.id" class="favorites__item" @tap="goShop(s.shop.id)">
          <image class="favorites__img" :src="s.shop.logo" mode="aspectFill" />
          <view class="favorites__info">
            <text class="favorites__name">{{ s.shop.name }}</text>
            <text class="favorites__sub"
              >月售 {{ s.shop.monthSales }} · ★ {{ s.shop.scoreAvg }}</text
            >
            <text class="favorites__time">收藏于 {{ formatTime(s.createdAt, 'YYYY-MM-DD') }}</text>
          </view>
          <view class="favorites__cancel" @tap.stop="onAskCancelShop(s)">
            <text>取消</text>
          </view>
        </view>
      </template>
      <template v-else>
        <view
          v-for="p in products"
          :key="p.id"
          class="favorites__item"
          @tap="goProduct(p.product.shopId, p.product.id)"
        >
          <image
            class="favorites__img"
            :src="p.product.images?.[0] ?? defaultImg"
            mode="aspectFill"
          />
          <view class="favorites__info">
            <text class="favorites__name">{{ p.product.name }}</text>
            <text class="favorites__sub">{{ p.shop.name }}</text>
            <text class="favorites__price">{{ formatAmount(p.product.price) }}</text>
          </view>
          <view class="favorites__cancel" @tap.stop="onAskCancelProduct(p)">
            <text>取消</text>
          </view>
        </view>
      </template>
      <view class="favorites__more">
        <text>{{ hasMore ? (loading ? '加载中...' : '上拉加载更多') : '—— 没有更多了 ——' }}</text>
      </view>
    </scroll-view>

    <BizDialog
      v-model:visible="confirmCancel"
      title="取消收藏"
      :content="`确定要取消收藏「${pendingName}」吗？`"
      confirm-text="取消收藏"
      @confirm="onDoCancel"
    />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/favorites.vue
   * @stage P5/T5.37 (Sprint 6)
   * @desc 我的收藏：店铺 / 商品 Tab；keyset 分页 + 取消收藏（二次确认）
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import BizDialog from '@/components/biz/BizDialog.vue'
  import {
    listFavoriteShops,
    listFavoriteProducts,
    unfavoriteShop,
    unfavoriteProduct
  } from '@/api/user'
  import type { FavoriteShop, FavoriteProduct } from '@/types/biz'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  const tabs = [
    { label: '收藏店铺', value: 'shop' },
    { label: '收藏商品', value: 'product' }
  ] as const

  const defaultImg = 'https://cdn.uviewui.com/uview/album/1.jpg'

  const activeTab = ref<number>(0)
  const shops = ref<FavoriteShop[]>([])
  const products = ref<FavoriteProduct[]>([])
  const loading = ref<boolean>(false)
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)

  const confirmCancel = ref<boolean>(false)
  const pendingShop = ref<FavoriteShop | null>(null)
  const pendingProduct = ref<FavoriteProduct | null>(null)

  const currentList = computed<unknown[]>(() =>
    activeTab.value === 0 ? shops.value : products.value
  )

  const emptyText = computed<string>(() =>
    activeTab.value === 0 ? '还没有收藏的店铺' : '还没有收藏的商品'
  )

  const pendingName = computed<string>(() => {
    if (pendingShop.value) return pendingShop.value.shop.name
    if (pendingProduct.value) return pendingProduct.value.product.name
    return ''
  })

  onShow(() => {
    void load(true)
  })

  async function load(reset = false) {
    if (reset) {
      cursor.value = null
      hasMore.value = true
      if (activeTab.value === 0) shops.value = []
      else products.value = []
    }
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      if (activeTab.value === 0) {
        const r = await listFavoriteShops({ cursor: cursor.value ?? undefined, pageSize: 20 })
        shops.value = reset ? r.list : [...shops.value, ...r.list]
        const next = (r as unknown as { nextCursor?: string | null }).nextCursor
        cursor.value = next ?? null
        hasMore.value = r.list.length > 0 && Boolean(next)
      } else {
        const r = await listFavoriteProducts({ cursor: cursor.value ?? undefined, pageSize: 20 })
        products.value = reset ? r.list : [...products.value, ...r.list]
        const next = (r as unknown as { nextCursor?: string | null }).nextCursor
        cursor.value = next ?? null
        hasMore.value = r.list.length > 0 && Boolean(next)
      }
    } catch (e) {
      logger.warn('favorites.list.fail', { e: String(e) })
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

  function onAskCancelShop(s: FavoriteShop) {
    pendingShop.value = s
    pendingProduct.value = null
    confirmCancel.value = true
  }

  function onAskCancelProduct(p: FavoriteProduct) {
    pendingProduct.value = p
    pendingShop.value = null
    confirmCancel.value = true
  }

  async function onDoCancel() {
    track(TRACK.CLICK_FAVORITE, { action: 'cancel' })
    try {
      if (pendingShop.value) {
        const id = pendingShop.value.shop.id
        await unfavoriteShop(id)
        shops.value = shops.value.filter((x) => x.shop.id !== id)
      } else if (pendingProduct.value) {
        const id = pendingProduct.value.product.id
        await unfavoriteProduct(id)
        products.value = products.value.filter((x) => x.product.id !== id)
      }
      uni.showToast({ title: '已取消收藏', icon: 'success' })
    } catch (e) {
      logger.warn('favorites.cancel.fail', { e: String(e) })
    } finally {
      pendingShop.value = null
      pendingProduct.value = null
    }
  }

  function goShop(shopId: string) {
    uni.navigateTo({ url: `/pages-takeout/shop-detail?shopId=${shopId}` })
  }

  function goProduct(shopId: string, productId: string) {
    uni.navigateTo({ url: `/pages-takeout/shop-detail?shopId=${shopId}&productId=${productId}` })
  }
</script>

<style lang="scss" scoped>
  .favorites {
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
      display: flex;
      gap: 16rpx;
      align-items: center;
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__img {
      flex-shrink: 0;
      width: 140rpx;
      height: 140rpx;
      background: $color-divider;
      border-radius: $radius-sm;
    }

    &__info {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 8rpx;
      overflow: hidden;
    }

    &__name {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;

      @include ellipsis(1);
    }

    &__sub {
      font-size: $font-size-sm;
      color: $color-text-secondary;

      @include ellipsis(1);
    }

    &__price {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__time {
      font-size: $font-size-xs;
      color: $color-text-placeholder;
    }

    &__cancel {
      flex-shrink: 0;
      padding: 8rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-danger;
      background: rgba(245, 108, 108, 0.08);
      border-radius: $radius-sm;
    }

    &__more {
      padding: 32rpx 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }
  }
</style>
