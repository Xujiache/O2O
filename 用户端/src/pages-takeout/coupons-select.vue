<template>
  <view class="page cs">
    <view class="cs__head">
      <text class="cs__head-text">订单金额 {{ formatAmount(total) }}</text>
    </view>

    <BizLoading v-if="loading" />
    <BizEmpty v-else-if="allList.length === 0" text="暂无可用优惠券" />

    <scroll-view v-else scroll-y class="cs__scroll">
      <view
        class="cs__opt-row"
        :class="{ 'cs__opt-row--active': selectedId === '' }"
        @tap="onSelect('')"
      >
        <text>不使用优惠券</text>
        <text v-if="selectedId === ''" class="cs__opt-row-mark">●</text>
      </view>

      <template v-if="availableList.length > 0">
        <view class="cs__group-head">
          <text>可用优惠券（{{ availableList.length }}）</text>
        </view>
        <view
          v-for="uc in availableList"
          :key="uc.id"
          class="cs__card"
          :class="{ 'cs__card--active': selectedId === uc.id }"
          @tap="onSelect(uc.id)"
        >
          <view class="cs__card-left">
            <text class="cs__card-amount">{{ amountText(uc) }}</text>
            <text class="cs__card-rule">{{ ruleText(uc) }}</text>
          </view>
          <view class="cs__card-right">
            <text class="cs__card-name">{{ uc.coupon.name }}</text>
            <text class="cs__card-valid">{{ validText(uc) }}</text>
            <text v-if="uc.coupon.remark" class="cs__card-remark">{{ uc.coupon.remark }}</text>
          </view>
          <view v-if="selectedId === uc.id" class="cs__card-mark">●</view>
        </view>
      </template>

      <template v-if="unavailableList.length > 0">
        <view class="cs__group-head">
          <text>不可用优惠券（{{ unavailableList.length }}）</text>
        </view>
        <view v-for="uc in unavailableList" :key="uc.id" class="cs__card cs__card--disabled">
          <view class="cs__card-left">
            <text class="cs__card-amount">{{ amountText(uc) }}</text>
            <text class="cs__card-rule">{{ ruleText(uc) }}</text>
          </view>
          <view class="cs__card-right">
            <text class="cs__card-name">{{ uc.coupon.name }}</text>
            <text class="cs__card-valid">{{ validText(uc) }}</text>
            <text class="cs__card-reason">未达到使用门槛</text>
          </view>
        </view>
      </template>
    </scroll-view>

    <view class="cs__bar">
      <view class="cs__bar-confirm" @tap="onConfirm">
        <text>确定</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-takeout/coupons-select.vue
   * @stage P5/T5.19 (Sprint 3)
   * @desc 优惠券手选：可用/不可用分组 + 单选互斥 + eventChannel 回传
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import currency from 'currency.js'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import { listMyCoupons } from '@/api/coupon'
  import type { UserCoupon } from '@/types/biz'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'

  const shopId = ref<string>('')
  const total = ref<string>('0')
  const loading = ref<boolean>(false)
  const allList = ref<UserCoupon[]>([])
  const selectedId = ref<string>('')

  const availableList = computed<UserCoupon[]>(() => allList.value.filter((uc) => isAvailable(uc)))
  const unavailableList = computed<UserCoupon[]>(() =>
    allList.value.filter((uc) => !isAvailable(uc))
  )

  onLoad((options) => {
    shopId.value = (options?.shopId as string) ?? ''
    total.value = (options?.total as string) ?? '0'
    void load()
  })

  async function load() {
    loading.value = true
    try {
      const r = await listMyCoupons({ status: 1, pageSize: 100 })
      allList.value = r.list ?? []
    } catch (e) {
      logger.warn('coupons.list.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function isAvailable(uc: UserCoupon): boolean {
    const min = currency(uc.coupon.minOrderAmount ?? 0).value
    return currency(total.value).value >= min
  }

  function amountText(uc: UserCoupon): string {
    const v = uc.coupon.discountValue
    if (uc.coupon.couponType === 2) {
      /* 折扣券：discountValue 为折数 ×10（如 8.5 折 → 85），用 currency.js 大数除 10 + 1 位小数展示 */
      const folds = currency(v).divide(10).value.toFixed(1)
      return `${folds}折`
    }
    /* 满减/立减券：直接用 currency.js 格式化为 ¥xx.xx */
    return currency(v, { symbol: '¥', precision: 2 }).format()
  }

  function ruleText(uc: UserCoupon): string {
    const min = currency(uc.coupon.minOrderAmount ?? 0).value
    if (min <= 0) return '无门槛'
    return `满 ${formatAmount(uc.coupon.minOrderAmount)} 可用`
  }

  function validText(uc: UserCoupon): string {
    if (uc.coupon.validType === 1) return '永久有效'
    const from = uc.validFrom ?? uc.coupon.validFrom
    const to = uc.validTo ?? uc.coupon.validTo
    if (!from || !to) return '有效期内'
    return `${formatTime(from, 'YYYY-MM-DD')} ~ ${formatTime(to, 'YYYY-MM-DD')}`
  }

  function onSelect(id: string) {
    if (id !== '' && !availableList.value.some((u) => u.id === id)) return
    selectedId.value = id
  }

  function onConfirm() {
    const pages = getCurrentPages()
    const cur = pages[pages.length - 1] as unknown as {
      getOpenerEventChannel?: () => { emit: (n: string, p: unknown) => void }
    }
    const channel = cur.getOpenerEventChannel?.()
    if (channel && typeof channel.emit === 'function') {
      const picked = allList.value.find((u) => u.id === selectedId.value)
      channel.emit('couponSelected', {
        userCouponId: selectedId.value,
        couponName: picked?.coupon.name ?? '',
        reduce: picked ? String(picked.coupon.discountValue) : ''
      })
    }
    uni.navigateBack()
  }
</script>

<style lang="scss" scoped>
  .cs {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: $color-bg-page;

    &__head {
      padding: 16rpx 32rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      background: $color-bg-white;
    }

    &__scroll {
      flex: 1;
      padding: 16rpx;
    }

    &__opt-row {
      @include flex-between;

      padding: 24rpx 32rpx;
      margin-bottom: 16rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      background: $color-bg-white;
      border-radius: $radius-md;

      &--active {
        color: $color-primary;
      }
    }

    &__opt-row-mark {
      color: $color-primary;
    }

    &__group-head {
      padding: 16rpx 16rpx 8rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__card {
      position: relative;
      display: flex;
      gap: 16rpx;
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border: 2rpx solid transparent;
      border-radius: $radius-md;

      &--active {
        border-color: $color-primary;
      }

      &--disabled {
        opacity: 0.5;
      }
    }

    &__card-left {
      display: flex;
      flex-direction: column;
      gap: 8rpx;
      align-items: center;
      justify-content: center;
      width: 200rpx;
      padding-right: 16rpx;
      border-right: 1rpx dashed $color-divider;
    }

    &__card-amount {
      font-size: 44rpx;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__card-rule {
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__card-right {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 8rpx;
      justify-content: center;
      min-width: 0;
    }

    &__card-name {
      @include ellipsis(1);

      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__card-valid {
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__card-remark {
      @include ellipsis(1);

      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__card-reason {
      font-size: $font-size-xs;
      color: $color-warning;
    }

    &__card-mark {
      position: absolute;
      top: 16rpx;
      right: 16rpx;
      font-size: $font-size-md;
      color: $color-primary;
    }

    &__bar {
      padding: 16rpx 32rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;

      @include safe-area-bottom;
    }

    &__bar-confirm {
      @include flex-center;

      width: 100%;
      height: 80rpx;
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-xl;
    }
  }
</style>
