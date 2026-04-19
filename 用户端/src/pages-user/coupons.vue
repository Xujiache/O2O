<template>
  <view class="page coupons">
    <view class="coupons__tabs">
      <view
        v-for="(t, i) in tabs"
        :key="t.value"
        class="coupons__tab"
        :class="{ 'coupons__tab--active': activeTab === i }"
        @tap="onTabChange(i)"
      >
        <text>{{ t.label }}</text>
      </view>
    </view>

    <BizLoading v-if="loading && list.length === 0" />
    <BizEmpty v-else-if="!loading && list.length === 0" :text="emptyText" />
    <scroll-view v-else scroll-y class="coupons__scroll" @scrolltolower="onLoadMore">
      <view
        v-for="uc in list"
        :key="uc.id"
        class="coupons__card"
        :class="{ 'coupons__card--inactive': activeTab !== 0 }"
      >
        <view class="coupons__left">
          <text class="coupons__amount">{{ amountText(uc.coupon) }}</text>
          <text class="coupons__rule">{{ ruleText(uc.coupon) }}</text>
        </view>
        <view class="coupons__right">
          <text class="coupons__name">{{ uc.coupon.name }}</text>
          <text class="coupons__scope">{{ scopeText(uc.coupon) }}</text>
          <text class="coupons__validity">{{ validityText(uc) }}</text>
        </view>
        <view v-if="activeTab === 0" class="coupons__btn">
          <text>去使用</text>
        </view>
        <view v-else class="coupons__status">
          <text>{{ statusText(uc.status) }}</text>
        </view>
      </view>
      <view class="coupons__more">
        <text>{{ hasMore ? (loading ? '加载中...' : '上拉加载更多') : '—— 没有更多了 ——' }}</text>
      </view>
    </scroll-view>

    <view class="coupons__footer safe-bottom">
      <button class="coupons__center-btn" @tap="openCenter">领券中心</button>
    </view>

    <BizDialog
      v-model:visible="centerVisible"
      title="领券中心"
      :show-cancel="false"
      confirm-text="关闭"
    >
      <BizLoading v-if="centerLoading" />
      <view v-else-if="centerList.length === 0" class="coupons__center-empty">
        <text>暂无可领取的优惠券</text>
      </view>
      <scroll-view v-else scroll-y class="coupons__center-list">
        <view v-for="c in centerList" :key="c.id" class="coupons__center-item">
          <view class="coupons__center-info">
            <text class="coupons__center-name">{{ c.name }}</text>
            <text class="coupons__center-rule">{{ ruleText(c) }}</text>
            <text class="coupons__center-validity">{{ couponValidity(c) }}</text>
          </view>
          <view
            class="coupons__center-receive"
            :class="{ 'coupons__center-receive--done': received.has(c.id) }"
            @tap="onReceive(c)"
          >
            <text>{{ received.has(c.id) ? '已领取' : '领取' }}</text>
          </view>
        </view>
      </scroll-view>
    </BizDialog>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/coupons.vue
   * @stage P5/T5.36 (Sprint 6)
   * @desc 我的优惠券：未使用/已使用/已过期 Tab + 领券中心弹窗
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import BizDialog from '@/components/biz/BizDialog.vue'
  import { listMyCoupons, listAvailableCoupons, receiveCoupon } from '@/api/coupon'
  import type { UserCoupon, Coupon } from '@/types/biz'
  import { formatAmount, formatTime, compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  type CouponStatus = 1 | 2 | 3
  interface TabDef {
    label: string
    value: 'unused' | 'used' | 'expired'
    status: CouponStatus
  }

  const tabs: TabDef[] = [
    { label: '未使用', value: 'unused', status: 1 },
    { label: '已使用', value: 'used', status: 2 },
    { label: '已过期', value: 'expired', status: 3 }
  ]

  const activeTab = ref<number>(0)
  const list = ref<UserCoupon[]>([])
  const loading = ref<boolean>(false)
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)

  const centerVisible = ref<boolean>(false)
  const centerLoading = ref<boolean>(false)
  const centerList = ref<Coupon[]>([])
  const received = ref<Set<string>>(new Set())

  const emptyText = computed<string>(
    () => ['暂无未使用的优惠券', '暂无已使用的优惠券', '暂无已过期的优惠券'][activeTab.value]
  )

  onShow(() => {
    void load(true)
  })

  async function load(reset = false) {
    if (reset) {
      cursor.value = null
      hasMore.value = true
      list.value = []
    }
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const r = await listMyCoupons({
        status: tabs[activeTab.value].status,
        cursor: cursor.value ?? undefined,
        pageSize: 20
      })
      list.value = reset ? r.list : [...list.value, ...r.list]
      const next = (r as unknown as { nextCursor?: string | null }).nextCursor
      cursor.value = next ?? null
      hasMore.value = r.list.length > 0 && Boolean(next)
    } catch (e) {
      logger.warn('coupons.list.fail', { e: String(e) })
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

  async function openCenter() {
    track(TRACK.CLICK_COUPON)
    centerVisible.value = true
    centerLoading.value = true
    try {
      centerList.value = await listAvailableCoupons()
    } catch (e) {
      logger.warn('coupons.center.fail', { e: String(e) })
    } finally {
      centerLoading.value = false
    }
  }

  async function onReceive(c: Coupon) {
    if (received.value.has(c.id)) return
    try {
      await receiveCoupon(c.id)
      received.value.add(c.id)
      received.value = new Set(received.value)
      track(TRACK.RECEIVE_COUPON, { couponId: c.id })
      uni.showToast({ title: '领取成功', icon: 'success' })
      if (activeTab.value === 0) {
        setTimeout(() => void load(true), 400)
      }
    } catch (e) {
      logger.warn('coupons.receive.fail', { e: String(e) })
    }
  }

  function amountText(c: Coupon): string {
    if (c.couponType === 2) {
      const off = (Number(c.discountValue) * 10).toFixed(1).replace(/\.0$/, '')
      return `${off} 折`
    }
    return `¥${formatAmount(c.discountValue, '')}`
  }

  function ruleText(c: Coupon): string {
    /* P5-REVIEW-01 R1 / I-03：用 currency.js 比较，避免 number 浮点 */
    if (!c.minOrderAmount || compareAmount(c.minOrderAmount, '0') <= 0) return '无门槛'
    return `满 ${formatAmount(c.minOrderAmount, '¥')} 可用`
  }

  function scopeText(c: Coupon): string {
    if (c.scene === 1) return '仅外卖'
    if (c.scene === 2) return '仅跑腿'
    return '通用'
  }

  function validityText(uc: UserCoupon): string {
    const from = uc.validFrom ?? uc.coupon.validFrom
    const to = uc.validTo ?? uc.coupon.validTo
    if (!from && !to) return '永久有效'
    return `${formatTime(from, 'YYYY-MM-DD')} ~ ${formatTime(to, 'YYYY-MM-DD')}`
  }

  function couponValidity(c: Coupon): string {
    if (c.validType === 1 || (!c.validFrom && !c.validTo)) return '永久有效'
    return `${formatTime(c.validFrom, 'YYYY-MM-DD')} ~ ${formatTime(c.validTo, 'YYYY-MM-DD')}`
  }

  function statusText(s: number): string {
    if (s === 2) return '已使用'
    if (s === 3) return '已过期'
    if (s === 4) return '已退回'
    return ''
  }
</script>

<style lang="scss" scoped>
  .coupons {
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

    &__card {
      position: relative;
      display: flex;
      align-items: center;
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
      box-shadow: $shadow-sm;

      &--inactive {
        opacity: 0.6;
      }
    }

    &__left {
      width: 200rpx;
      padding-right: 24rpx;
      text-align: center;
      border-right: 2rpx dashed $color-divider;
    }

    &__amount {
      display: block;
      font-size: 48rpx;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__rule {
      display: block;
      margin-top: 8rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__right {
      flex: 1;
      padding-left: 24rpx;
    }

    &__name {
      display: block;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__scope {
      display: inline-block;
      padding: 2rpx 12rpx;
      margin-top: 8rpx;
      font-size: $font-size-xs;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-xs;
    }

    &__validity {
      display: block;
      margin-top: 12rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__btn {
      flex-shrink: 0;
      padding: 8rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-md;
    }

    &__status {
      flex-shrink: 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__more {
      padding: 32rpx 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }

    &__footer {
      padding: 16rpx 24rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;
    }

    &__center-btn {
      width: 100%;
      height: 88rpx;
      font-size: $font-size-md;
      line-height: 88rpx;
      color: $color-text-inverse;
      background: $color-primary;
      border: none;
      border-radius: $radius-lg;
    }

    &__center-list {
      max-height: 60vh;
    }

    &__center-empty {
      padding: 48rpx 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }

    &__center-item {
      display: flex;
      align-items: center;
      padding: 16rpx 0;
      border-bottom: 1rpx solid $color-divider;
    }

    &__center-info {
      flex: 1;
      text-align: left;
    }

    &__center-name {
      display: block;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__center-rule {
      display: block;
      margin-top: 4rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__center-validity {
      display: block;
      margin-top: 4rpx;
      font-size: $font-size-xs;
      color: $color-text-placeholder;
    }

    &__center-receive {
      flex-shrink: 0;
      padding: 8rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-md;

      &--done {
        color: $color-text-secondary;
        background: $color-divider;
      }
    }
  }
</style>
