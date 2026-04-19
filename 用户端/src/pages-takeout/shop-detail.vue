<template>
  <view class="page sd">
    <BizLoading v-if="loadingShop && !shop" fullscreen text="加载店铺..." />
    <BizError
      v-else-if="errMsg && !shop"
      :title="errMsg"
      desc="请检查网络后重试"
      @retry="loadAll"
    />

    <template v-else-if="shop">
      <view class="sd__header">
        <image v-if="shop.cover" class="sd__cover" :src="shop.cover" mode="aspectFill" />
        <view v-else class="sd__cover-placeholder" />
        <view class="sd__mask" />
        <view class="sd__head-row">
          <image class="sd__logo" :src="shop.logo" mode="aspectFill" />
          <view class="sd__head-info">
            <text class="sd__name">{{ shop.name }}</text>
            <view class="sd__head-meta">
              <text class="sd__score">★ {{ scoreText }}</text>
              <text class="sd__sales">月售 {{ shop.monthSales }}</text>
              <text v-if="distanceText" class="sd__distance">{{ distanceText }}</text>
            </view>
          </view>
          <view class="sd__fav" @tap="onToggleFav">
            <text>{{ favored ? '★ 已收藏' : '☆ 收藏' }}</text>
          </view>
        </view>

        <view class="sd__head-bar">
          <text class="sd__bar-item">起送 {{ formatAmount(shop.minAmount) }}</text>
          <text class="sd__bar-item">配送 {{ formatAmount(shop.deliveryFee) }}</text>
          <text class="sd__bar-item">{{ shop.prepareMin }} 分钟</text>
        </view>

        <view v-if="(shop.tags?.length ?? 0) > 0" class="sd__tags">
          <text v-for="t in shop.tags" :key="t" class="sd__tag">{{ t }}</text>
        </view>

        <view v-if="shop.announcement" class="sd__notice">
          <text>公告：{{ shop.announcement }}</text>
        </view>
      </view>

      <view class="sd__nav">
        <view
          class="sd__nav-tab"
          :class="{ 'sd__nav-tab--active': mainTab === 'menu' }"
          @tap="mainTab = 'menu'"
        >
          <text>菜单</text>
        </view>
        <view
          class="sd__nav-tab"
          :class="{ 'sd__nav-tab--active': mainTab === 'review' }"
          @tap="onGoReview"
        >
          <text>评价</text>
        </view>
      </view>

      <view v-if="mainTab === 'menu'" class="sd__body">
        <BizLoading v-if="loadingCats" />
        <BizEmpty v-else-if="categories.length === 0" text="暂无商品" />
        <template v-else>
          <scroll-view scroll-y class="sd__side">
            <view
              v-for="c in categories"
              :key="c.id"
              class="sd__cat"
              :class="{ 'sd__cat--active': activeCategoryId === c.id }"
              @tap="onSelectCategory(c.id)"
            >
              <text>{{ c.name }}</text>
            </view>
          </scroll-view>

          <scroll-view
            scroll-y
            scroll-with-animation
            class="sd__main"
            :scroll-into-view="scrollIntoId"
            @scroll="onMainScroll"
          >
            <view v-for="c in categories" :id="`cat_${c.id}`" :key="c.id" class="sd__group">
              <view class="sd__group-head">
                <text>{{ c.name }}</text>
              </view>
              <view
                v-for="p in productsOf(c.id)"
                :key="p.id"
                class="sd__prod"
                @tap="onTapProduct(p)"
              >
                <image class="sd__prod-img" :src="p.images?.[0] ?? ''" mode="aspectFill" />
                <view class="sd__prod-info">
                  <text class="sd__prod-name">{{ p.name }}</text>
                  <view class="sd__prod-meta">
                    <text class="sd__prod-sales">月售 {{ p.monthSales }}</text>
                    <text class="sd__prod-score">★ {{ formatScore(p.scoreAvg) }}</text>
                  </view>
                  <view class="sd__prod-row">
                    <text class="sd__prod-price">{{ formatAmount(p.price) }}</text>
                    <view class="sd__prod-add" @tap.stop="onAddProduct(p)">
                      <text>+</text>
                    </view>
                  </view>
                </view>
              </view>
              <view v-if="productsOf(c.id).length === 0" class="sd__empty-cat">
                <text>本分类暂无商品</text>
              </view>
            </view>
          </scroll-view>
        </template>
      </view>

      <view class="sd__cart-bar">
        <view class="sd__cart-bar-left" @tap="onToggleCart">
          <view class="sd__cart-icon">
            <text>购</text>
            <view v-if="cartCount > 0" class="sd__cart-badge">
              <text>{{ cartCount }}</text>
            </view>
          </view>
          <view class="sd__cart-amount">
            <text class="sd__cart-amount-val">{{ formatAmount(cartSubtotal) }}</text>
            <text class="sd__cart-amount-sub">配送 {{ formatAmount(shop.deliveryFee) }}</text>
          </view>
        </view>
        <view
          class="sd__cart-checkout"
          :class="{ 'sd__cart-checkout--disabled': !canCheckout }"
          @tap="onCheckout"
        >
          <text>{{ checkoutText }}</text>
        </view>
      </view>
    </template>

    <ProductDetail
      v-if="pdProductId"
      v-model:visible="pdVisible"
      :product-id="pdProductId"
      @add-to-cart="onProductDetailAdd"
    />
    <CartSheet v-if="shop" v-model:visible="cartSheetVisible" :shop-id="shop.id" />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-takeout/shop-detail.vue
   * @stage P5/T5.15 (Sprint 3)
   * @desc 店铺详情：Header + 左侧分类 + 右侧商品 + 底部购物车浮层
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizError from '@/components/biz/BizError.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import ProductDetail from '@/components/biz/ProductDetail.vue'
  import CartSheet from '@/components/biz/CartSheet.vue'
  import { getShopDetail, getShopProductCategories, getShopProducts } from '@/api/shop'
  import { favoriteShop, unfavoriteShop } from '@/api/user'
  import { useCartStore } from '@/store/cart'
  import { useUserStore } from '@/store/user'
  import type { Shop, Product, ProductCategory, CartItem } from '@/types/biz'
  import { formatAmount, formatDistance, compareAmount, subAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  const cart = useCartStore()
  const user = useUserStore()

  const shopId = ref<string>('')
  const shop = ref<Shop | null>(null)
  const categories = ref<ProductCategory[]>([])
  const products = ref<Product[]>([])
  const loadingShop = ref<boolean>(false)
  const loadingCats = ref<boolean>(false)
  const errMsg = ref<string>('')

  const mainTab = ref<'menu' | 'review'>('menu')
  const activeCategoryId = ref<string>('')
  const scrollIntoId = ref<string>('')

  const favored = ref<boolean>(false)

  const pdVisible = ref<boolean>(false)
  const pdProductId = ref<string>('')

  const cartSheetVisible = ref<boolean>(false)

  const cartCount = computed<number>(() => (shopId.value ? cart.totalCount(shopId.value) : 0))
  const cartSubtotal = computed<string>(() => (shopId.value ? cart.subtotal(shopId.value) : '0.00'))

  const scoreText = computed<string>(() => formatScore(shop.value?.scoreAvg))

  const distanceText = computed<string>(() => {
    if (!shop.value) return ''
    const d = shop.value.distance
    if (!d || d <= 0) return ''
    return formatDistance(d)
  })

  /**
   * 起送判断（基于 currency.js 大数库；P5-REVIEW-01 R1 / I-03）
   * 替换原 Number(cartSubtotal) >= Number(minAmount) 的浮点比较
   */
  const canCheckout = computed<boolean>(() => {
    if (!shop.value || cartCount.value === 0) return false
    return compareAmount(cartSubtotal.value, shop.value.minAmount) >= 0
  })

  const checkoutText = computed<string>(() => {
    if (!shop.value) return '去结算'
    if (cartCount.value === 0) return `¥${shop.value.minAmount} 起送`
    if (!canCheckout.value) {
      /* 差价用 subAmount 大数减法（避免 number 浮点） */
      const left = subAmount(shop.value.minAmount, cartSubtotal.value)
      return `还差 ¥${left} 起送`
    }
    return '去结算'
  })

  onLoad((options) => {
    const sid = (options?.shopId as string) ?? ''
    if (!sid) {
      uni.showToast({ title: '店铺不存在', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    shopId.value = sid
    void loadAll()
  })

  async function loadAll() {
    errMsg.value = ''
    await Promise.all([loadShop(), loadCategoriesAndProducts()])
  }

  async function loadShop() {
    loadingShop.value = true
    try {
      const s = await getShopDetail(shopId.value)
      shop.value = s
      track(TRACK.VIEW_SHOP, { shopId: s.id, shopName: s.name })
    } catch (e) {
      errMsg.value = '店铺加载失败'
      logger.warn('shop.detail.fail', { e: String(e), shopId: shopId.value })
    } finally {
      loadingShop.value = false
    }
  }

  async function loadCategoriesAndProducts() {
    loadingCats.value = true
    try {
      const cats = await getShopProductCategories(shopId.value)
      categories.value = cats
      if (cats.length > 0) {
        activeCategoryId.value = cats[0].id
      }
      const r = await getShopProducts(shopId.value, { pageSize: 200 })
      products.value = r.list ?? []
    } catch (e) {
      logger.warn('shop.products.fail', { e: String(e), shopId: shopId.value })
    } finally {
      loadingCats.value = false
    }
  }

  function productsOf(catId: string): Product[] {
    return products.value.filter((p) => p.categoryId === catId)
  }

  function onSelectCategory(catId: string) {
    activeCategoryId.value = catId
    scrollIntoId.value = `cat_${catId}`
  }
  function onMainScroll(_e: unknown) {
    /* 简化：不做交叉观察；选中态以左侧菜单点击为准 */
  }

  function onTapProduct(p: Product) {
    /* 单 SKU 也允许点开详情看大图；多 SKU 必须点开 */
    pdProductId.value = p.id
    pdVisible.value = true
  }

  function onAddProduct(p: Product) {
    if (!shop.value) return
    if (p.hasSku === 1) {
      pdProductId.value = p.id
      pdVisible.value = true
      return
    }
    const item: CartItem = {
      productId: p.id,
      skuId: p.id,
      productName: p.name,
      skuName: '默认',
      unitPrice: p.price,
      count: 1,
      image: p.images?.[0] ?? '',
      addedAt: Date.now()
    }
    addToCart(item)
  }

  function onProductDetailAdd(item: CartItem) {
    addToCart(item)
  }

  function addToCart(item: CartItem) {
    if (!shop.value) return
    cart.addItem(
      {
        shopId: shop.value.id,
        shopName: shop.value.name,
        shopLogo: shop.value.logo,
        minAmount: shop.value.minAmount,
        deliveryFee: shop.value.deliveryFee
      },
      item
    )
    track(TRACK.CLICK_ADD_CART, {
      shopId: shop.value.id,
      productId: item.productId,
      skuId: item.skuId
    })
    uni.showToast({ title: '已加入购物车', icon: 'none', duration: 800 })
  }

  function onToggleCart() {
    if (cartCount.value === 0) {
      uni.showToast({ title: '购物车是空的', icon: 'none' })
      return
    }
    cartSheetVisible.value = true
  }

  function onCheckout() {
    if (!shop.value) return
    if (!user.isLogin) {
      uni.navigateTo({
        url:
          '/pages/login/index?redirect=' +
          encodeURIComponent(`/pages-takeout/shop-detail?shopId=${shop.value.id}`)
      })
      return
    }
    if (cartCount.value === 0) {
      uni.showToast({ title: '请先添加商品', icon: 'none' })
      return
    }
    if (!canCheckout.value) {
      uni.showToast({ title: checkoutText.value, icon: 'none' })
      return
    }
    track(TRACK.CLICK_CHECKOUT, { shopId: shop.value.id, total: cartSubtotal.value })
    uni.navigateTo({ url: `/pages-takeout/checkout?shopId=${shop.value.id}` })
  }

  async function onToggleFav() {
    if (!shop.value) return
    if (!user.isLogin) {
      uni.navigateTo({
        url:
          '/pages/login/index?redirect=' +
          encodeURIComponent(`/pages-takeout/shop-detail?shopId=${shop.value.id}`)
      })
      return
    }
    track(TRACK.CLICK_FAVORITE, { shopId: shop.value.id, target: favored.value ? 'off' : 'on' })
    try {
      if (favored.value) {
        await unfavoriteShop(shop.value.id)
        favored.value = false
        uni.showToast({ title: '已取消收藏', icon: 'none' })
      } else {
        await favoriteShop(shop.value.id)
        favored.value = true
        uni.showToast({ title: '已收藏', icon: 'none' })
      }
    } catch (e) {
      logger.warn('shop.favorite.fail', { e: String(e), shopId: shop.value.id })
    }
  }

  function onGoReview() {
    if (!shop.value) return
    uni.navigateTo({ url: `/pages-takeout/review-list?shopId=${shop.value.id}` })
  }

  function formatScore(s: string | number | undefined | null): string {
    if (s === null || s === undefined || s === '') return '5.0'
    const n = Number(s)
    if (Number.isNaN(n)) return '5.0'
    return n.toFixed(1)
  }
</script>

<style lang="scss" scoped>
  .sd {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $color-bg-page;

    &__header {
      position: relative;
      padding: 24rpx 32rpx 16rpx;
      color: $color-text-inverse;
      background: linear-gradient(135deg, $color-primary 0%, $color-primary-light 100%);
    }

    &__cover {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0.4;
    }

    &__cover-placeholder {
      position: absolute;
      inset: 0;
    }

    &__mask {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.35) 100%);
    }

    &__head-row {
      position: relative;
      display: flex;
      gap: 16rpx;
      align-items: flex-start;
    }

    &__logo {
      flex-shrink: 0;
      width: 120rpx;
      height: 120rpx;
      background: $color-bg-white;
      border: 2rpx solid rgba(255, 255, 255, 0.6);
      border-radius: $radius-md;
    }

    &__head-info {
      flex: 1;
      min-width: 0;
    }

    &__name {
      @include ellipsis(1);

      font-size: $font-size-xl;
      font-weight: $font-weight-bold;
    }

    &__head-meta {
      display: flex;
      gap: 16rpx;
      margin-top: 8rpx;
      font-size: $font-size-sm;
    }

    &__score {
      color: #ffd83d;
    }

    &__fav {
      flex-shrink: 0;
      padding: 8rpx 20rpx;
      font-size: $font-size-sm;
      background: rgba(255, 255, 255, 0.18);
      border-radius: $radius-xl;
    }

    &__head-bar {
      position: relative;
      display: flex;
      gap: 24rpx;
      margin-top: 24rpx;
      font-size: $font-size-sm;
    }

    &__tags {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      gap: 12rpx;
      margin-top: 16rpx;
    }

    &__tag {
      padding: 4rpx 16rpx;
      font-size: $font-size-xs;
      background: rgba(255, 255, 255, 0.18);
      border-radius: $radius-sm;
    }

    &__notice {
      position: relative;
      margin-top: 16rpx;
      font-size: $font-size-sm;
      line-height: 1.4;
      opacity: 0.9;
    }

    &__nav {
      display: flex;
      background: $color-bg-white;
      border-bottom: 1rpx solid $color-divider;
    }

    &__nav-tab {
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

    &__body {
      display: flex;
      flex: 1;
      min-height: 0;
    }

    &__side {
      flex-shrink: 0;
      width: 180rpx;
      background: $color-bg-page;
    }

    &__cat {
      padding: 24rpx 16rpx;
      font-size: $font-size-sm;
      color: $color-text-regular;
      text-align: center;
      border-left: 4rpx solid transparent;

      &--active {
        font-weight: $font-weight-medium;
        color: $color-primary;
        background: $color-bg-white;
        border-left-color: $color-primary;
      }
    }

    &__main {
      flex: 1;
      min-width: 0;
      padding: 0 16rpx 200rpx;
      background: $color-bg-white;
    }

    &__group-head {
      padding: 24rpx 8rpx 16rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__prod {
      display: flex;
      gap: 16rpx;
      padding: 16rpx 8rpx;
      border-bottom: 1rpx solid $color-divider;
    }

    &__prod-img {
      flex-shrink: 0;
      width: 160rpx;
      height: 160rpx;
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__prod-info {
      display: flex;
      flex: 1;
      flex-direction: column;
      justify-content: space-between;
      min-width: 0;
    }

    &__prod-name {
      @include ellipsis(2);

      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__prod-meta {
      display: flex;
      gap: 16rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__prod-score {
      color: $color-warning;
    }

    &__prod-row {
      @include flex-between;
    }

    &__prod-price {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__prod-add {
      @include flex-center;

      width: 48rpx;
      height: 48rpx;
      font-size: $font-size-md;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-circle;
    }

    &__empty-cat {
      padding: 48rpx 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }

    &__cart-bar {
      @include flex-between;

      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: $z-index-fixed;
      gap: 16rpx;
      padding: 16rpx 24rpx;
      background: $color-bg-white;
      box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.08);

      @include safe-area-bottom;
    }

    &__cart-bar-left {
      display: flex;
      flex: 1;
      gap: 16rpx;
      align-items: center;
    }

    &__cart-icon {
      @include flex-center;

      position: relative;
      width: 88rpx;
      height: 88rpx;
      font-size: $font-size-md;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-circle;
    }

    &__cart-badge {
      @include flex-center;

      position: absolute;
      top: -4rpx;
      right: -4rpx;
      min-width: 32rpx;
      height: 32rpx;
      padding: 0 8rpx;
      font-size: $font-size-xs;
      color: $color-text-inverse;
      background: $color-danger;
      border-radius: $radius-xl;
    }

    &__cart-amount {
      display: flex;
      flex-direction: column;
    }

    &__cart-amount-val {
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__cart-amount-sub {
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__cart-checkout {
      @include flex-center;

      min-width: 200rpx;
      height: 80rpx;
      padding: 0 32rpx;
      font-size: $font-size-md;
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
