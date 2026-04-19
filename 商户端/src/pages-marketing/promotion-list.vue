<template>
  <view class="page page-pml">
    <view class="pml-tabs">
      <view
        v-for="t in tabs"
        :key="t.key"
        class="pml-tab"
        :class="{ 'pml-tab--active': curTab === t.key }"
        @click="onTabChange(t.key)"
        >{{ t.label }}</view
      >
    </view>

    <scroll-view scroll-y class="pml-list" @scrolltolower="loadMore">
      <view v-for="p in promotions" :key="p.id" class="pml-card">
        <view class="row-between">
          <text class="pml-card__name">{{ p.name }}</text>
          <text class="pml-card__type" :class="`pml-card__type--${p.promotionType}`">
            {{ typeName(p.promotionType) }}
          </text>
        </view>
        <text class="pml-card__valid"
          >{{ formatDate(p.validFrom) }} ~ {{ formatDate(p.validTo) }}</text
        >
        <view class="row-between pml-card__footer">
          <text class="pml-status" :class="`pml-status--${p.status}`">{{
            statusText(p.status)
          }}</text>
          <view class="row pml-card__actions">
            <BizBtn
              v-if="p.status === 1"
              type="default"
              text="暂停"
              perm="marketing:edit"
              @click="onToggle(p, 2)"
            />
            <BizBtn
              v-else
              type="success"
              text="启用"
              perm="marketing:edit"
              @click="onToggle(p, 1)"
            />
            <BizBtn type="primary" text="编辑" perm="marketing:edit" @click="goEdit(p.id)" />
          </view>
        </view>
      </view>

      <BizEmpty v-if="!loading && promotions.length === 0" title="暂无营销活动">
        <template #action>
          <BizBtn type="primary" text="新建活动" perm="marketing:edit" @click="goCreate" />
        </template>
      </BizEmpty>
      <BizLoading v-if="loading" />
    </scroll-view>

    <view v-if="promotions.length > 0" class="pml-fab" @click="goCreate">+</view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import { useShopStore } from '@/store'
  import type { ShopPromotion } from '@/types/biz'
  import { listPromotions, togglePromotion } from '@/api/marketing'
  import { mockEnabled, delay } from '@/api/_mock'
  import { formatDate } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 营销活动列表（T6.36）
   *
   * 类型：1 满减 / 2 折扣 / 3 拼单 / 4 新品推荐
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()

  const tabs = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '进行中' },
    { key: 'paused', label: '已暂停' }
  ] as const
  type TabKey = (typeof tabs)[number]['key']
  const curTab = ref<TabKey>('all')

  const promotions = ref<ShopPromotion[]>([])
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)
  const loading = ref<boolean>(false)

  function typeName(t: number): string {
    return ['', '满减', '折扣', '拼单', '新品推荐'][t]
  }
  function statusText(s: number): string {
    return s === 1 ? '已启用' : s === 2 ? '已暂停' : '草稿'
  }

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
    promotions.value = []
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
        promotions.value = await delay([
          {
            id: 'pm-1',
            shopId: shopStore.currentShopId,
            promotionType: 1,
            name: '满 50 减 10',
            config: {},
            validFrom: '2026-04-01T00:00:00.000Z',
            validTo: '2026-12-31T23:59:59.000Z',
            status: 1,
            createdAt: '2026-04-01T10:00:00.000Z'
          }
        ] as ShopPromotion[])
        hasMore.value = false
      } else {
        const r = await listPromotions({
          shopId: shopStore.currentShopId,
          status,
          cursor: cursor.value,
          limit: 20
        })
        promotions.value.push(...r.list)
        cursor.value = r.nextCursor
        hasMore.value = r.hasMore
      }
    } catch (e) {
      logger.warn('pml.load.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  async function onToggle(p: ShopPromotion, status: 1 | 2) {
    try {
      if (!mockEnabled()) await togglePromotion(p.id, status)
      p.status = status
      uni.showToast({ title: status === 1 ? '已启用' : '已暂停', icon: 'success' })
    } catch (e) {
      logger.warn('pml.toggle.fail', { e: String(e) })
    }
  }

  function goCreate() {
    uni.navigateTo({ url: '/pages-marketing/promotion-edit' })
  }
  function goEdit(id: string) {
    uni.navigateTo({ url: `/pages-marketing/promotion-edit?id=${id}` })
  }
</script>

<style lang="scss" scoped>
  .page-pml {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $uni-bg-color-grey;
  }

  .pml-tabs {
    display: flex;
    background: #fff;
    border-bottom: 1rpx solid $uni-border-color;
  }

  .pml-tab {
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

  .pml-list {
    flex: 1;
    padding: 16rpx;
  }

  .pml-card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__name {
      font-size: 28rpx;
      font-weight: 500;
    }

    &__type {
      padding: 4rpx 12rpx;
      font-size: 20rpx;
      border-radius: 999rpx;

      &--1 {
        color: $uni-color-error;
        background: rgb(255 77 79 / 12%);
      }

      &--2 {
        color: $uni-color-warning;
        background: rgb(250 140 22 / 12%);
      }

      &--3 {
        color: $uni-color-primary;
        background: $uni-color-primary-light;
      }

      &--4 {
        color: $uni-color-success;
        background: rgb(82 196 26 / 12%);
      }
    }

    &__valid {
      display: block;
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__footer {
      margin-top: 16rpx;
    }

    &__actions {
      gap: 12rpx;
    }
  }

  .pml-status {
    padding: 4rpx 12rpx;
    font-size: 20rpx;
    border-radius: 999rpx;

    &--1 {
      color: $uni-color-success;
      background: rgb(82 196 26 / 12%);
    }

    &--2 {
      color: $uni-text-color-grey;
      background: $uni-bg-color-grey;
    }
  }

  .pml-fab {
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
