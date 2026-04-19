<template>
  <view v-if="visible" class="pd" @tap="onMaskTap">
    <view class="pd__panel" @tap.stop>
      <view class="pd__close" @tap="onClose">
        <text>×</text>
      </view>

      <BizLoading v-if="loading" text="加载商品..." />
      <BizError v-else-if="errMsg" :title="errMsg" desc="" @retry="loadDetail" />

      <scroll-view v-else-if="product" scroll-y class="pd__body">
        <swiper
          v-if="(product.images?.length ?? 0) > 0"
          class="pd__swiper"
          :indicator-dots="(product.images?.length ?? 0) > 1"
          :autoplay="false"
          circular
        >
          <swiper-item v-for="(img, i) in product.images" :key="i">
            <image class="pd__swiper-img" :src="img" mode="aspectFill" />
          </swiper-item>
        </swiper>
        <view v-else class="pd__placeholder">
          <text>暂无图片</text>
        </view>

        <view class="pd__info">
          <text class="pd__name">{{ product.name }}</text>
          <view class="pd__meta">
            <text class="pd__sales">月售 {{ product.monthSales }}</text>
            <text class="pd__score">★ {{ formatScore(product.scoreAvg) }}</text>
          </view>
          <text v-if="product.description" class="pd__desc">{{ product.description }}</text>
        </view>

        <view v-if="hasSku" class="pd__section">
          <text class="pd__section-title">规格</text>
          <view class="pd__skus">
            <view
              v-for="sku in product.skus"
              :key="sku.id"
              class="pd__sku"
              :class="{
                'pd__sku--active': selectedSkuId === sku.id,
                'pd__sku--disabled': sku.stockQty <= 0
              }"
              @tap="onSelectSku(sku.id)"
            >
              <text class="pd__sku-name">{{ sku.name }}</text>
            </view>
          </view>
        </view>

        <view class="pd__section pd__section--qty">
          <text class="pd__section-title">数量</text>
          <view class="pd__qty">
            <view class="pd__qty-btn" :class="{ 'pd__qty-btn--disabled': qty <= 1 }" @tap="onDec">
              <text>-</text>
            </view>
            <text class="pd__qty-val">{{ qty }}</text>
            <view class="pd__qty-btn" @tap="onInc">
              <text>+</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <view v-if="product" class="pd__footer">
        <view class="pd__price">
          <text class="pd__price-label">合计</text>
          <text class="pd__price-val">{{ formatAmount(totalPrice) }}</text>
        </view>
        <view class="pd__add" :class="{ 'pd__add--disabled': !canAdd }" @tap="onAdd">
          <text>加入购物车</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file ProductDetail.vue
   * @stage P5/T5.16 (Sprint 3)
   * @desc 商品详情弹窗：图轮播 + 描述 + 多 SKU 选择 + 数量加减 + 加入购物车
   * @author 单 Agent V2.0
   */
  import { ref, computed, watch } from 'vue'
  import BizLoading from './BizLoading.vue'
  import BizError from './BizError.vue'
  import { getProductDetail } from '@/api/shop'
  import type { Product, ProductSku, CartItem } from '@/types/biz'
  import { formatAmount, mulAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  const props = defineProps<{
    productId: string
    visible: boolean
  }>()

  const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'addToCart', item: CartItem): void
  }>()

  const product = ref<Product | null>(null)
  const loading = ref<boolean>(false)
  const errMsg = ref<string>('')
  const selectedSkuId = ref<string>('')
  const qty = ref<number>(1)

  const hasSku = computed<boolean>(() => {
    if (!product.value) return false
    return product.value.hasSku === 1 && (product.value.skus?.length ?? 0) > 0
  })

  const selectedSku = computed<ProductSku | null>(() => {
    if (!product.value) return null
    if (!hasSku.value) return null
    const skus = product.value.skus ?? []
    return skus.find((s) => s.id === selectedSkuId.value) ?? null
  })

  const unitPrice = computed<string>(() => {
    if (!product.value) return '0.00'
    if (hasSku.value && selectedSku.value) return selectedSku.value.price
    return product.value.price
  })

  const totalPrice = computed<string>(() => {
    return mulAmount(unitPrice.value, qty.value)
  })

  /**
   * 当前选中规格 / 商品的库存上限
   * 优先级：选中 SKU.stockQty > 商品 stockQty（无 SKU 商品） > MAX_SAFE_INTEGER（兜底不卡）
   */
  const maxStock = computed<number>(() => {
    if (selectedSku.value && typeof selectedSku.value.stockQty === 'number') {
      return selectedSku.value.stockQty
    }
    if (product.value && typeof product.value.stockQty === 'number') {
      return product.value.stockQty
    }
    return Number.MAX_SAFE_INTEGER
  })

  const canAdd = computed<boolean>(() => {
    if (!product.value) return false
    if (hasSku.value && !selectedSku.value) return false
    if (maxStock.value <= 0) return false
    if (qty.value <= 0) return false
    if (qty.value > maxStock.value) return false
    return true
  })

  watch(
    () => props.visible,
    (v) => {
      if (v) {
        qty.value = 1
        selectedSkuId.value = ''
        if (props.productId) void loadDetail()
      }
    },
    { immediate: true }
  )

  async function loadDetail() {
    if (!props.productId) return
    loading.value = true
    errMsg.value = ''
    try {
      const p = await getProductDetail(props.productId)
      product.value = p
      track(TRACK.VIEW_PRODUCT, { productId: p.id })
      /* 默认选第一个有库存的 SKU */
      if (p.hasSku === 1 && p.skus && p.skus.length > 0) {
        const firstAvail = p.skus.find((s) => s.stockQty > 0)
        if (firstAvail) selectedSkuId.value = firstAvail.id
      }
    } catch (e) {
      errMsg.value = '商品加载失败'
      logger.warn('product.detail.fail', { e: String(e), productId: props.productId })
    } finally {
      loading.value = false
    }
  }

  function onSelectSku(skuId: string) {
    const sku = product.value?.skus?.find((s) => s.id === skuId)
    if (sku && sku.stockQty <= 0) {
      uni.showToast({ title: '该规格已售罄', icon: 'none' })
      return
    }
    selectedSkuId.value = skuId
    /* 切换规格后若当前数量超过新规格库存，自动回拉到库存上限（最少 1） */
    if (sku && qty.value > sku.stockQty) {
      qty.value = Math.max(1, sku.stockQty)
    }
  }

  /**
   * 数量 +：超过库存上限时不再递增并 toast 提示（前端超卖防御）
   * 库存值取自 maxStock computed（SKU 优先，无 SKU 取商品自身 stockQty，兜底 MAX_SAFE_INTEGER）
   */
  function onInc() {
    const max = maxStock.value
    if (qty.value < max) {
      qty.value += 1
    } else if (max < Number.MAX_SAFE_INTEGER) {
      uni.showToast({ title: `库存仅剩 ${max} 件`, icon: 'none' })
    }
  }

  function onDec() {
    if (qty.value > 1) qty.value -= 1
  }

  function onAdd() {
    if (!canAdd.value || !product.value) return
    const sku = selectedSku.value
    const skuId = sku?.id ?? product.value.id
    const skuName = sku?.name ?? '默认'
    const item: CartItem = {
      productId: product.value.id,
      skuId,
      productName: product.value.name,
      skuName,
      spec: sku?.attrs,
      unitPrice: unitPrice.value,
      count: qty.value,
      image: product.value.images?.[0] ?? '',
      addedAt: Date.now()
    }
    emit('addToCart', item)
    emit('update:visible', false)
  }

  function onClose() {
    emit('update:visible', false)
  }

  function onMaskTap() {
    emit('update:visible', false)
  }

  function formatScore(s: string | number | undefined | null): string {
    if (s === null || s === undefined || s === '') return '5.0'
    const n = Number(s)
    if (Number.isNaN(n)) return '5.0'
    return n.toFixed(1)
  }
</script>

<style lang="scss" scoped>
  .pd {
    position: fixed;
    inset: 0;
    z-index: $z-index-modal;
    background: $color-bg-mask;

    &__panel {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      display: flex;
      flex-direction: column;
      max-height: 80vh;
      background: $color-bg-white;
      border-top-left-radius: $radius-lg;
      border-top-right-radius: $radius-lg;
    }

    &__close {
      @include flex-center;

      position: absolute;
      top: 16rpx;
      right: 16rpx;
      z-index: 1;
      width: 56rpx;
      height: 56rpx;
      font-size: 40rpx;
      color: $color-text-inverse;
      background: rgba(0, 0, 0, 0.4);
      border-radius: $radius-circle;
    }

    &__body {
      flex: 1;
      max-height: calc(80vh - 120rpx);
    }

    &__swiper {
      width: 100%;
      height: 480rpx;
    }

    &__swiper-img {
      width: 100%;
      height: 100%;
    }

    &__placeholder {
      @include flex-center;

      width: 100%;
      height: 320rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      background: $color-bg-page;
    }

    &__info {
      padding: 24rpx 32rpx;
    }

    &__name {
      display: block;
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__meta {
      display: flex;
      gap: 24rpx;
      margin-top: 12rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__score {
      color: $color-warning;
    }

    &__desc {
      display: block;
      margin-top: 16rpx;
      font-size: $font-size-base;
      line-height: 1.6;
      color: $color-text-regular;
    }

    &__section {
      padding: 16rpx 32rpx 24rpx;
      border-top: 1rpx solid $color-divider;

      &--qty {
        @include flex-between;
      }
    }

    &__section-title {
      display: block;
      margin-bottom: 16rpx;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__skus {
      display: flex;
      flex-wrap: wrap;
      gap: 16rpx;
    }

    &__sku {
      padding: 12rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-text-regular;
      background: $color-bg-page;
      border: 2rpx solid transparent;
      border-radius: $radius-md;

      &--active {
        color: $color-primary;
        background: rgba(255, 106, 26, 0.08);
        border-color: $color-primary;
      }

      &--disabled {
        color: $color-text-disabled;
        text-decoration: line-through;
      }
    }

    &__qty {
      display: flex;
      gap: 16rpx;
      align-items: center;
    }

    &__qty-btn {
      @include flex-center;

      width: 56rpx;
      height: 56rpx;
      font-size: $font-size-lg;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-circle;

      &--disabled {
        color: $color-text-disabled;
        background: $color-bg-hover;
      }
    }

    &__qty-val {
      min-width: 64rpx;
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
      text-align: center;
    }

    &__footer {
      @include flex-between;

      padding: 16rpx 32rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;

      @include safe-area-bottom;
    }

    &__price {
      display: flex;
      gap: 8rpx;
      align-items: baseline;
    }

    &__price-label {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__price-val {
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__add {
      @include flex-center;

      min-width: 240rpx;
      height: 80rpx;
      padding: 0 32rpx;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-xl;

      &--disabled {
        background: $color-text-disabled;
      }
    }
  }
</style>
