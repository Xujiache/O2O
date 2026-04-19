<template>
  <view class="shop-list">
    <view
      v-for="shop in shops"
      :key="shop.id"
      class="shop-list__item card"
      :class="{ 'shop-list__item--closed': shop.isOpen === 0 }"
      @tap="onClickShop(shop.id)"
    >
      <view class="shop-list__cover">
        <image
          class="shop-list__cover-img"
          :src="shop.cover || shop.logo || PLACEHOLDER_IMG"
          mode="aspectFill"
          lazy-load
        />
        <view v-if="shop.isOpen === 0" class="shop-list__closed-mask">
          <text class="shop-list__closed-text">休息中</text>
        </view>
      </view>

      <view class="shop-list__body">
        <view class="shop-list__title-row">
          <text class="shop-list__name u-line-1">{{ shop.name }}</text>
          <text v-if="shop.distance >= 0" class="shop-list__distance">
            {{ formatDistance(shop.distance) }}
          </text>
        </view>

        <view class="shop-list__meta-row">
          <text class="shop-list__score">★ {{ shop.scoreAvg || '5.0' }}</text>
          <text class="shop-list__sales">月售 {{ shop.monthSales || 0 }}</text>
          <text v-if="shop.prepareMin > 0" class="shop-list__prepare">
            {{ shop.prepareMin }} 分钟
          </text>
        </view>

        <view class="shop-list__fee-row">
          <text class="shop-list__min-amount">起送 {{ formatAmount(shop.minAmount) }}</text>
          <text class="shop-list__divider">·</text>
          <text class="shop-list__delivery-fee">配送费 {{ formatAmount(shop.deliveryFee) }}</text>
        </view>

        <view v-if="shop.tags && shop.tags.length > 0" class="shop-list__tags">
          <text v-for="t in shop.tags.slice(0, 3)" :key="t" class="shop-list__tag">
            {{ t }}
          </text>
        </view>
      </view>
    </view>

    <view class="shop-list__footer">
      <view v-if="loading" class="shop-list__loading">
        <text class="shop-list__loading-text">加载中...</text>
      </view>
      <view v-else-if="hasMore" class="shop-list__loadmore" @tap="onLoadMore">
        <text class="shop-list__loadmore-text">加载更多</text>
      </view>
      <view v-else-if="shops.length > 0" class="shop-list__nomore">
        <text class="shop-list__nomore-text">— 没有更多了 —</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file components/biz/ShopList.vue
   * @stage P5/T5.13 (Sprint 2)
   * @desc 店铺列表卡片组件：封面/名称/评分/月售/距离/起送+配送费/tag；
   *   提供「加载中 / 加载更多 / 没有更多」三态尾部
   * @author 单 Agent V2.0
   */
  import { defineProps, defineEmits, withDefaults } from 'vue'
  import type { Shop } from '@/types/biz'
  import { formatAmount, formatDistance } from '@/utils/format'

  /**
   * 默认占位图（uView Plus CDN 通用占位）
   */
  const PLACEHOLDER_IMG = 'https://cdn.uviewui.com/uview/empty/list.png'

  /**
   * 组件 Props
   */
  withDefaults(
    defineProps<{
      /** 店铺列表 */
      shops: Shop[]
      /** 是否正在加载（控制底部 loading 提示） */
      loading?: boolean
      /** 是否还有更多（false 时显示"没有更多了"） */
      hasMore?: boolean
    }>(),
    {
      loading: false,
      hasMore: true
    }
  )

  /**
   * 事件
   * @event loadMore 触发加载下一页（点击「加载更多」时；通常由父组件 scrolltolower 主动触发）
   * @event clickShop 点击单店；payload 为店铺 id
   */
  const emit = defineEmits<{
    (e: 'loadMore'): void
    (e: 'clickShop', id: string): void
  }>()

  /**
   * 点击单店
   * @param id 店铺 id
   */
  function onClickShop(id: string): void {
    emit('clickShop', id)
  }

  /**
   * 点击底部「加载更多」
   */
  function onLoadMore(): void {
    emit('loadMore')
  }
</script>

<style lang="scss" scoped>
  .shop-list {
    padding: 0 24rpx;

    &__item {
      display: flex;
      gap: 20rpx;
      align-items: stretch;
      padding: 20rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;

      &:active {
        background: $color-bg-hover;
      }

      &--closed {
        opacity: 0.6;
      }
    }

    &__cover {
      position: relative;
      flex-shrink: 0;
      width: 160rpx;
      height: 160rpx;
      overflow: hidden;
      background: $color-bg-page;
      border-radius: $radius-sm;
    }

    &__cover-img {
      width: 100%;
      height: 100%;
    }

    &__closed-mask {
      @include flex-center;

      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
    }

    &__closed-text {
      font-size: $font-size-sm;
      color: $color-text-inverse;
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
      color: $color-text-secondary;
    }

    &__score {
      color: $color-warning;
    }

    &__sales,
    &__prepare {
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

    &__tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8rpx;
      margin-top: 4rpx;
    }

    &__tag {
      padding: 2rpx 12rpx;
      font-size: $font-size-xs;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-xs;
    }

    &__footer {
      @include flex-center;

      padding: 32rpx 0 48rpx;
    }

    &__loading-text,
    &__loadmore-text,
    &__nomore-text {
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
