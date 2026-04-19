<template>
  <view class="page page-cl">
    <view class="cl-tabs">
      <view
        v-for="t in tabs"
        :key="t.key"
        class="cl-tab"
        :class="{ 'cl-tab--active': curTab === t.key }"
        @click="onTabChange(t.key)"
        >{{ t.label }}</view
      >
    </view>

    <scroll-view scroll-y class="cl-list" @scrolltolower="loadMore">
      <view v-for="c in coupons" :key="c.id" class="cl-card">
        <view class="cl-card__left">
          <text class="cl-card__amount">¥{{ formatAmount(c.discountValue, '') }}</text>
          <text class="cl-card__cond">满 {{ c.minOrderAmount }} 可用</text>
        </view>
        <view class="cl-card__body">
          <text class="cl-card__name">{{ c.name }}</text>
          <text v-if="c.validType === 2" class="cl-card__valid"
            >{{ formatDate(c.validFrom) }} ~ {{ formatDate(c.validTo) }}</text
          >
          <text v-else class="cl-card__valid">永久有效</text>
          <view class="row-between cl-card__stat">
            <text>已领 {{ c.receivedQty }}/{{ c.totalQty }}</text>
            <text>已用 {{ c.usedQty }}</text>
          </view>
        </view>
        <view class="cl-card__actions">
          <BizBtn
            v-if="c.status === 1"
            type="default"
            text="停用"
            perm="marketing:edit"
            @click="onToggle(c, 2)"
          />
          <BizBtn v-else type="success" text="启用" perm="marketing:edit" @click="onToggle(c, 1)" />
          <BizBtn type="primary" text="编辑" perm="marketing:edit" @click="goEdit(c.id)" />
        </view>
      </view>
      <BizEmpty v-if="!loading && coupons.length === 0" title="暂无优惠券">
        <template #action>
          <BizBtn type="primary" text="新建店铺券" perm="marketing:edit" @click="goCreate" />
        </template>
      </BizEmpty>
      <BizLoading v-if="loading" />
    </scroll-view>

    <view v-if="coupons.length > 0" class="cl-fab" @click="goCreate">+</view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import { useShopStore } from '@/store'
  import type { ShopCoupon } from '@/types/biz'
  import { listCoupons, toggleCoupon } from '@/api/marketing'
  import { mockEnabled, mockCoupons, delay } from '@/api/_mock'
  import { formatAmount, formatDate } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 店铺券列表（T6.35）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()

  const tabs = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '已启用' },
    { key: 'paused', label: '已停用' }
  ] as const
  type TabKey = (typeof tabs)[number]['key']
  const curTab = ref<TabKey>('all')

  const coupons = ref<ShopCoupon[]>([])
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)

  onMounted(() => {
    void refresh()
  })

  onShow(() => {
    void refresh()
  })

  function onTabChange(k: TabKey) {
    if (curTab.value === k) return
    curTab.value = k
    void refresh()
  }

  async function refresh() {
    cursor.value = null
    hasMore.value = true
    coupons.value = []
    await loadMore()
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      const status =
        curTab.value === 'active'
          ? (1 as const)
          : curTab.value === 'paused'
            ? (2 as const)
            : undefined
      if (mockEnabled()) {
        const filtered = mockCoupons.filter((c) =>
          status === undefined ? true : c.status === status
        )
        coupons.value = await delay(filtered)
        hasMore.value = false
      } else {
        const r = await listCoupons({
          shopId: shopStore.currentShopId,
          status,
          cursor: cursor.value,
          limit: 20
        })
        coupons.value.push(...r.list)
        cursor.value = r.nextCursor
        hasMore.value = r.hasMore
      }
    } catch (e) {
      logger.warn('cl.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  async function onToggle(c: ShopCoupon, status: 1 | 2) {
    try {
      if (!mockEnabled()) await toggleCoupon(c.id, status)
      c.status = status
      uni.showToast({ title: status === 1 ? '已启用' : '已停用', icon: 'success' })
    } catch (e) {
      logger.warn('cl.toggle.fail', { e: String(e) })
    }
  }

  function goCreate() {
    uni.navigateTo({ url: '/pages-marketing/coupon-edit' })
  }
  function goEdit(id: string) {
    uni.navigateTo({ url: `/pages-marketing/coupon-edit?id=${id}` })
  }
</script>

<style lang="scss" scoped>
  .page-cl {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $uni-bg-color-grey;
  }

  .cl-tabs {
    display: flex;
    background: #fff;
    border-bottom: 1rpx solid $uni-border-color;
  }

  .cl-tab {
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

  .cl-list {
    flex: 1;
    padding: 16rpx;
  }

  .cl-card {
    display: flex;
    align-items: center;
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__left {
      width: 180rpx;
      padding: 24rpx;
      margin-right: 16rpx;
      color: #fff;
      text-align: center;
      background: linear-gradient(135deg, $uni-color-error 0%, #ff7875 100%);
      border-radius: 12rpx;
    }

    &__amount {
      display: block;
      font-size: 36rpx;
      font-weight: 700;
    }

    &__cond {
      display: block;
      margin-top: 4rpx;
      font-size: 20rpx;
      opacity: 0.85;
    }

    &__body {
      flex: 1;
    }

    &__name {
      display: block;
      font-size: 28rpx;
      font-weight: 500;
    }

    &__valid {
      display: block;
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__stat {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__actions {
      display: flex;
      flex-direction: column;
      gap: 8rpx;
      margin-left: 16rpx;
    }
  }

  .cl-fab {
    position: fixed;
    right: 32rpx;
    bottom: 64rpx;
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
