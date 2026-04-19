<template>
  <view class="price-est">
    <view class="price-est__head">
      <text class="price-est__head-title">费用预估</text>
      <text v-if="result && result.distance > 0" class="price-est__head-meta">
        约 {{ formatDistance(result.distance) }} · {{ result.estimatedDurationMin }} 分钟
      </text>
    </view>

    <view v-if="loading || internalLoading" class="price-est__skeleton">
      <view v-for="i in 4" :key="i" class="price-est__sk-row" />
      <view class="price-est__sk-row price-est__sk-row--total" />
    </view>

    <view v-else-if="result" class="price-est__panel">
      <view class="price-est__row">
        <text class="price-est__label">基础费</text>
        <text class="price-est__value">{{ formatAmount(result.baseFee) }}</text>
      </view>
      <view class="price-est__row">
        <text class="price-est__label">距离费</text>
        <text class="price-est__value">{{ formatAmount(result.distanceFee) }}</text>
      </view>
      <view class="price-est__row">
        <text class="price-est__label">重量费</text>
        <text class="price-est__value">{{ formatAmount(result.weightFee) }}</text>
      </view>
      <view class="price-est__row">
        <text class="price-est__label">服务费</text>
        <text class="price-est__value">{{ formatAmount(result.serviceFee) }}</text>
      </view>
      <view v-if="hasInsurance" class="price-est__row">
        <text class="price-est__label">保价费</text>
        <text class="price-est__value">{{ formatAmount(result.insuranceFee) }}</text>
      </view>
      <view class="price-est__divider" />
      <view class="price-est__row price-est__row--total">
        <text class="price-est__label price-est__label--total">合计</text>
        <text class="price-est__value price-est__value--total">
          {{ formatAmount(result.total) }}
        </text>
      </view>
    </view>

    <view v-else class="price-est__hint">
      <text class="price-est__hint-text">{{ hintText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file PriceEstimate.vue
   * @stage P5/T5.24 (Sprint 4)
   * @desc 跑腿价格预估卡片：watch params + debounce 500ms 调 previewErrandPrice；展示明细 + 合计
   * @author 单 Agent V2.0
   */
  import { computed, ref, watch, defineProps, defineEmits, withDefaults, onUnmounted } from 'vue'
  import type { ErrandPriceParams, ErrandPriceResult } from '@/types/biz'
  import { previewErrandPrice } from '@/api/order'
  import { formatAmount, formatDistance } from '@/utils/format'
  import { logger } from '@/utils/logger'

  const props = withDefaults(
    defineProps<{
      /** 预估请求参数；为 null 表示尚未填齐，不发请求 */
      params: ErrandPriceParams | null
      /** 外部强制 loading（如下单中） */
      loading?: boolean
      /** 默认提示文案 */
      hint?: string
    }>(),
    {
      loading: false,
      hint: '请填写完整地址 / 物品信息后查看费用预估'
    }
  )

  const emit = defineEmits<{
    (e: 'priceUpdate', result: ErrandPriceResult): void
    (e: 'priceError', err: string): void
  }>()

  /** 预估结果 */
  const result = ref<ErrandPriceResult | null>(null)
  /** 内部请求状态 */
  const internalLoading = ref<boolean>(false)
  /** debounce 计时器 */
  let timer: ReturnType<typeof setTimeout> | null = null

  /** 是否含保价（保价费 > 0 才显示该行，避免冗余 0 元） */
  const hasInsurance = computed<boolean>(() => {
    if (!result.value) return false
    return Number(result.value.insuranceFee || 0) > 0
  })

  /** 空态文案：参数无效时回退到默认 */
  const hintText = computed<string>(() => props.hint)

  /**
   * 校验参数是否完整：跑排队仅需 queueDuration；其余需 pickup + delivery 坐标
   */
  function isParamsValid(p: ErrandPriceParams): boolean {
    if (p.serviceType === 4) {
      return Boolean(p.queueDuration && p.queueDuration > 0)
    }
    return Boolean(
      p.pickupLng &&
      p.pickupLat &&
      p.deliveryLng &&
      p.deliveryLat &&
      Number(p.pickupLng) !== 0 &&
      Number(p.pickupLat) !== 0
    )
  }

  /** 真正请求后端预估 */
  async function doFetch(p: ErrandPriceParams) {
    internalLoading.value = true
    try {
      const r = await previewErrandPrice(p)
      result.value = r
      emit('priceUpdate', r)
    } catch (e) {
      logger.warn('price.preview.fail', { e: String(e) })
      result.value = null
      emit('priceError', String(e))
    } finally {
      internalLoading.value = false
    }
  }

  watch(
    () => props.params,
    (newParams) => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (!newParams || !isParamsValid(newParams)) {
        result.value = null
        return
      }
      const snapshot: ErrandPriceParams = { ...newParams }
      timer = setTimeout(() => {
        void doFetch(snapshot)
      }, 500)
    },
    { deep: true, immediate: true }
  )

  onUnmounted(() => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  })
</script>

<style lang="scss" scoped>
  .price-est {
    margin: 24rpx;
    padding: 24rpx 28rpx;
    background: $color-bg-white;
    border-radius: $radius-lg;
    box-shadow: $shadow-sm;

    &__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 16rpx;
    }

    &__head-title {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__head-meta {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__skeleton {
      padding: 8rpx 0;
    }

    &__sk-row {
      height: 32rpx;
      margin-bottom: 16rpx;
      background: linear-gradient(90deg, #f2f2f2 0%, #fafafa 50%, #f2f2f2 100%);
      background-size: 200% 100%;
      border-radius: $radius-sm;
      animation: price-est-sk 1.4s linear infinite;

      &--total {
        height: 40rpx;
        margin-top: 24rpx;
      }
    }

    &__panel {
      padding-top: 8rpx;
    }

    &__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10rpx 0;

      &--total {
        padding-top: 16rpx;
      }
    }

    &__label {
      font-size: $font-size-sm;
      color: $color-text-regular;

      &--total {
        font-size: $font-size-md;
        font-weight: $font-weight-medium;
        color: $color-text-primary;
      }
    }

    &__value {
      font-size: $font-size-base;
      color: $color-text-primary;

      &--total {
        font-size: $font-size-xl;
        font-weight: $font-weight-bold;
        color: $color-primary;
      }
    }

    &__divider {
      height: 1rpx;
      margin: 16rpx 0 8rpx;
      background: $color-divider;
    }

    &__hint {
      padding: 32rpx 8rpx;
      text-align: center;
    }

    &__hint-text {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }
  }

  @keyframes price-est-sk {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
