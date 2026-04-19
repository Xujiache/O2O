<template>
  <view v-if="visible" class="cs" @tap="onMaskTap">
    <view class="cs__panel" @tap.stop>
      <view class="cs__head">
        <text class="cs__title">购物车</text>
        <view v-if="hasItems" class="cs__clear" @tap="onClear">
          <text>清空</text>
        </view>
      </view>

      <view v-if="needHint" class="cs__hint">
        <text>{{ hintText }}</text>
      </view>

      <view v-if="!hasItems" class="cs__empty">
        <text>购物车是空的</text>
      </view>
      <scroll-view v-else scroll-y class="cs__list">
        <view v-for="(it, i) in items" :key="`${it.skuId}_${i}`" class="cs__item">
          <image class="cs__item-img" :src="it.image" mode="aspectFill" />
          <view class="cs__item-info">
            <text class="cs__item-name">{{ it.productName }}</text>
            <text v-if="showSku(it)" class="cs__item-sku">{{ it.skuName }}</text>
            <text class="cs__item-price">{{ formatAmount(it.unitPrice) }}</text>
          </view>
          <view class="cs__item-qty">
            <view
              class="cs__qty-btn"
              :class="{ 'cs__qty-btn--disabled': it.count <= 1 }"
              @tap="onDec(it)"
            >
              <text>-</text>
            </view>
            <text class="cs__qty-val">{{ it.count }}</text>
            <view class="cs__qty-btn" @tap="onInc(it)">
              <text>+</text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <BizDialog
      v-model:visible="confirmVisible"
      title="清空购物车"
      content="确定清空当前店铺购物车吗？"
      confirm-text="清空"
      cancel-text="取消"
      @confirm="onConfirmClear"
    />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file CartSheet.vue
   * @stage P5/T5.17 (Sprint 3)
   * @desc 购物车底部抽屉：单店列表 + 加减/清空 + 凑单提示
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import BizDialog from './BizDialog.vue'
  import { useCartStore } from '@/store/cart'
  import type { CartItem } from '@/types/biz'
  import { formatAmount, subAmount } from '@/utils/format'
  import { track, TRACK } from '@/utils/track'

  const props = defineProps<{
    shopId: string
    visible: boolean
  }>()

  const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'cleared'): void
  }>()

  const cart = useCartStore()
  const confirmVisible = ref<boolean>(false)

  const shopCart = computed(() => cart.getShopCart(props.shopId))

  const items = computed<CartItem[]>(() => shopCart.value?.items ?? [])

  const hasItems = computed<boolean>(() => items.value.length > 0)

  const subtotal = computed<string>(() => cart.subtotal(props.shopId))

  const minAmount = computed<string>(() => shopCart.value?.minAmount ?? '0')

  const needHint = computed<boolean>(() => {
    if (!hasItems.value) return false
    return Number(subtotal.value) < Number(minAmount.value)
  })

  const hintText = computed<string>(() => {
    const diff = subAmount(minAmount.value, subtotal.value)
    return `还差 ${formatAmount(diff)} 起送`
  })

  function showSku(it: CartItem): boolean {
    return Boolean(it.skuName) && it.skuName !== '默认'
  }

  function onInc(it: CartItem) {
    if (!shopCart.value) return
    cart.setItemCount(props.shopId, it.skuId, it.count + 1, it.spec)
    track(TRACK.CLICK_ADD_CART, { shopId: props.shopId, skuId: it.skuId })
  }

  function onDec(it: CartItem) {
    if (it.count <= 1) {
      cart.setItemCount(props.shopId, it.skuId, 0, it.spec)
    } else {
      cart.setItemCount(props.shopId, it.skuId, it.count - 1, it.spec)
    }
    track(TRACK.CLICK_REMOVE_CART, { shopId: props.shopId, skuId: it.skuId })
  }

  function onClear() {
    confirmVisible.value = true
  }

  function onConfirmClear() {
    cart.clearShopCart(props.shopId)
    emit('cleared')
    emit('update:visible', false)
  }

  function onMaskTap() {
    emit('update:visible', false)
  }
</script>

<style lang="scss" scoped>
  .cs {
    position: fixed;
    inset: 0;
    z-index: $z-index-modal;
    background: $color-bg-mask;

    &__panel {
      position: absolute;
      right: 0;
      bottom: 110rpx;
      left: 0;
      display: flex;
      flex-direction: column;
      max-height: 60vh;
      background: $color-bg-white;
      border-top-left-radius: $radius-lg;
      border-top-right-radius: $radius-lg;
    }

    &__head {
      @include flex-between;

      padding: 24rpx 32rpx;
      border-bottom: 1rpx solid $color-divider;
    }

    &__title {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__clear {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__hint {
      padding: 12rpx 32rpx;
      font-size: $font-size-sm;
      color: $color-warning;
      background: rgba(230, 162, 60, 0.08);
    }

    &__empty {
      @include flex-center;

      padding: 80rpx 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__list {
      max-height: calc(60vh - 100rpx);
    }

    &__item {
      display: flex;
      gap: 16rpx;
      padding: 24rpx 32rpx;
      border-bottom: 1rpx solid $color-divider;
    }

    &__item-img {
      flex-shrink: 0;
      width: 120rpx;
      height: 120rpx;
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__item-info {
      display: flex;
      flex: 1;
      flex-direction: column;
      justify-content: space-between;
      min-width: 0;
    }

    &__item-name {
      @include ellipsis(1);

      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__item-sku {
      @include ellipsis(1);

      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__item-price {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__item-qty {
      display: flex;
      gap: 12rpx;
      align-items: center;
      align-self: flex-end;
    }

    &__qty-btn {
      @include flex-center;

      width: 48rpx;
      height: 48rpx;
      font-size: $font-size-md;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-circle;

      &--disabled {
        color: $color-text-disabled;
        background: $color-bg-hover;
      }
    }

    &__qty-val {
      min-width: 48rpx;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
      text-align: center;
    }
  }
</style>
