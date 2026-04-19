<template>
  <view class="page page-pl">
    <!-- 顶部分类 + 操作 -->
    <view class="pl-header row-between">
      <scroll-view scroll-x class="pl-cats">
        <text class="pl-cat" :class="{ 'pl-cat--active': curCat === '' }" @click="onSelectCat('')"
          >全部</text
        >
        <text
          v-for="c in categories"
          :key="c.id"
          class="pl-cat"
          :class="{ 'pl-cat--active': curCat === c.id }"
          @click="onSelectCat(c.id)"
          >{{ c.name }}</text
        >
      </scroll-view>
      <text class="pl-cat-mgr" @click="goCategory">分类管理</text>
    </view>

    <!-- 状态筛选 -->
    <view class="pl-tabs">
      <view
        v-for="t in tabs"
        :key="t.key"
        class="pl-tab"
        :class="{ 'pl-tab--active': curTab === t.key }"
        @click="onTabChange(t.key)"
        >{{ t.label }}</view
      >
    </view>

    <!-- 商品列表 -->
    <scroll-view scroll-y class="pl-list" @scrolltolower="loadMore">
      <view v-for="p in products" :key="p.id" class="pl-card">
        <view class="pl-card__left" @click="goEdit(p.id)">
          <image
            class="pl-card__img"
            :src="p.images[0] || '/static/placeholder.png'"
            mode="aspectFill"
          />
          <view v-if="p.status === 2" class="pl-card__off">已下架</view>
        </view>
        <view class="pl-card__body" @click="goEdit(p.id)">
          <text class="pl-card__name">{{ p.name }}</text>
          <view class="row pl-tags" v-if="p.tags?.length">
            <text v-for="tag in p.tags.slice(0, 2)" :key="tag" class="pl-tag">{{ tag }}</text>
          </view>
          <view class="row-between">
            <text class="pl-card__price">{{ formatAmount(p.price) }}</text>
            <text class="pl-card__sales">月销 {{ p.monthSales }}</text>
          </view>
        </view>
        <view class="pl-card__actions">
          <BizBtn type="primary" text="编辑" perm="product:edit" @click="goEdit(p.id)" />
          <BizBtn
            v-if="p.status === 1"
            type="default"
            text="下架"
            perm="product:toggle"
            @click="onToggleStatus(p, 2)"
          />
          <BizBtn
            v-else
            type="success"
            text="上架"
            perm="product:toggle"
            @click="onToggleStatus(p, 1)"
          />
        </view>
      </view>

      <BizEmpty v-if="!loading && products.length === 0" title="暂无商品" scene="product">
        <template #action>
          <BizBtn type="primary" text="新建商品" perm="product:edit" @click="goCreate" />
        </template>
      </BizEmpty>
      <BizLoading v-if="loading" />
    </scroll-view>

    <!-- 浮动新增 -->
    <view class="pl-fab" @click="goCreate" v-if="products.length > 0">+</view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import { useShopStore } from '@/store'
  import type { Product, ProductCategory } from '@/types/biz'
  import { listCategories, listProducts, toggleProductStatus } from '@/api/product'
  import { mockEnabled, mockCategories, mockProducts, delay } from '@/api/_mock'
  import { formatAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 商品管理（tabBar 3 / T6.25-T6.27）
   *
   * 顶部分类滚动 + 状态筛选 + 列表 + 新建/编辑/上下架
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()

  const tabs = [
    { key: 'all', label: '全部' },
    { key: 'online', label: '上架中' },
    { key: 'offline', label: '已下架' },
    { key: 'draft', label: '草稿' }
  ] as const
  type TabKey = (typeof tabs)[number]['key']

  const curTab = ref<TabKey>('all')
  const curCat = ref<string>('')
  const categories = ref<ProductCategory[]>([])
  const products = ref<Product[]>([])
  const page = ref<number>(1)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)

  onMounted(async () => {
    track(TRACK.VIEW_PRODUCT_LIST)
    await loadCategories()
    await refresh()
  })

  onShow(async () => {
    if (shopStore.currentShopId) {
      await refresh()
    }
  })

  async function loadCategories() {
    if (!shopStore.currentShopId) return
    try {
      categories.value = mockEnabled()
        ? await delay(mockCategories)
        : await listCategories(shopStore.currentShopId)
    } catch (e) {
      logger.warn('pl.cat.fail', { e: String(e) })
    }
  }

  function onSelectCat(id: string) {
    if (curCat.value === id) return
    curCat.value = id
    void refresh()
  }

  function onTabChange(k: TabKey) {
    if (curTab.value === k) return
    curTab.value = k
    void refresh()
  }

  async function refresh() {
    page.value = 1
    hasMore.value = true
    products.value = []
    await loadMore()
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    if (!shopStore.currentShopId) return
    loading.value = true
    try {
      const status =
        curTab.value === 'online'
          ? (1 as const)
          : curTab.value === 'offline'
            ? (2 as const)
            : curTab.value === 'draft'
              ? (0 as const)
              : undefined
      if (mockEnabled()) {
        const filtered = mockProducts.filter(
          (p) =>
            (curCat.value ? p.categoryId === curCat.value : true) &&
            (status !== undefined ? p.status === status : true)
        )
        const r = await delay({
          list: filtered,
          meta: { page: 1, pageSize: 20, total: filtered.length, totalPages: 1 }
        })
        products.value.push(...r.list)
        hasMore.value = false
      } else {
        const r = await listProducts({
          shopId: shopStore.currentShopId,
          categoryId: curCat.value || undefined,
          status,
          page: page.value,
          pageSize: 20
        })
        products.value.push(...r.list)
        hasMore.value = page.value * 20 < r.meta.total
        page.value += 1
      }
    } catch (e) {
      logger.warn('pl.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  async function onToggleStatus(p: Product, status: 1 | 2) {
    try {
      if (mockEnabled()) await delay({ ok: true })
      else await toggleProductStatus(p.id, status)
      track(TRACK.TOGGLE_PRODUCT_ONLINE, { productId: p.id, status })
      uni.showToast({ title: status === 1 ? '已上架' : '已下架', icon: 'success' })
      await refresh()
    } catch (e) {
      logger.warn('pl.toggle.fail', { e: String(e) })
    }
  }

  function goCategory() {
    uni.navigateTo({ url: '/pages-product/category' })
  }
  function goCreate() {
    uni.navigateTo({ url: '/pages-product/edit' })
  }
  function goEdit(id: string) {
    uni.navigateTo({ url: `/pages-product/edit?id=${id}` })
  }
</script>

<style lang="scss" scoped>
  .page-pl {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $uni-bg-color-grey;
  }

  .pl-header {
    padding: 16rpx 24rpx;
    background: #fff;
    border-bottom: 1rpx solid $uni-border-color;
  }

  .pl-cats {
    flex: 1;
    white-space: nowrap;
  }

  .pl-cat {
    display: inline-block;
    padding: 8rpx 16rpx;
    margin-right: 8rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;
    background: $uni-bg-color-grey;
    border-radius: 999rpx;

    &--active {
      color: $uni-color-primary;
      background: $uni-color-primary-light;
    }
  }

  .pl-cat-mgr {
    margin-left: 16rpx;
    font-size: 22rpx;
    color: $uni-color-primary;
  }

  .pl-tabs {
    display: flex;
    padding: 0 24rpx;
    background: #fff;
    border-bottom: 1rpx solid $uni-border-color;
  }

  .pl-tab {
    flex: 1;
    padding: 16rpx 0;
    font-size: 24rpx;
    color: $uni-text-color-grey;
    text-align: center;

    &--active {
      font-weight: 500;
      color: $uni-color-primary;
      border-bottom: 4rpx solid $uni-color-primary;
    }
  }

  .pl-list {
    flex: 1;
    padding: 16rpx;
  }

  .pl-card {
    display: flex;
    padding: 16rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__left {
      position: relative;
      width: 160rpx;
      height: 160rpx;
      margin-right: 16rpx;
      overflow: hidden;
      border-radius: 12rpx;
    }

    &__img {
      width: 100%;
      height: 100%;
    }

    &__off {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24rpx;
      color: #fff;
      background: rgb(0 0 0 / 60%);
    }

    &__body {
      display: flex;
      flex: 1;
      flex-direction: column;
      justify-content: space-between;
    }

    &__name {
      overflow: hidden;
      font-size: 28rpx;
      font-weight: 500;
      color: $uni-text-color;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__price {
      font-size: 30rpx;
      font-weight: 600;
      color: $uni-color-error;
    }

    &__sales {
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__actions {
      display: flex;
      flex-direction: column;
      gap: 8rpx;
      align-items: flex-end;
      justify-content: center;
      margin-left: 16rpx;
    }
  }

  .pl-tags {
    gap: 4rpx;
    margin: 4rpx 0;
  }

  .pl-tag {
    padding: 0 8rpx;
    font-size: 18rpx;
    color: $uni-color-warning;
    background: rgb(250 140 22 / 12%);
    border-radius: 4rpx;
  }

  .pl-fab {
    position: fixed;
    right: 32rpx;
    bottom: 200rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 96rpx;
    height: 96rpx;
    font-size: 48rpx;
    color: #fff;
    background: $uni-color-primary;
    border-radius: 50%;
    box-shadow: 0 4rpx 16rpx rgb(47 128 237 / 30%);
  }
</style>
