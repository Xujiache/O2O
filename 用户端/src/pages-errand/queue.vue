<template>
  <view class="page errand-form">
    <!-- 排队场所 -->
    <view class="errand-form__card">
      <view class="errand-form__sect-title">
        <text class="errand-form__sect-title-text">排队场所</text>
      </view>
      <view class="errand-form__field">
        <text class="errand-form__label">场所名称</text>
        <input
          v-model="queuePlace"
          class="errand-form__input"
          placeholder="如：协和医院 / 工商银行国贸支行"
          maxlength="40"
        />
      </view>
      <view class="errand-form__addr-row" @tap="onPickPlace">
        <view class="errand-form__addr-icon errand-form__addr-icon--pickup">
          <text>位</text>
        </view>
        <view class="errand-form__addr-body">
          <text v-if="pickup.detail" class="errand-form__addr-detail">{{ pickup.detail }}</text>
          <text v-else class="errand-form__addr-placeholder">点击选择具体位置</text>
        </view>
        <text class="errand-form__addr-arrow">›</text>
      </view>
      <picker
        mode="selector"
        :value="queueTypeIdx"
        :range="QUEUE_TYPES"
        @change="onQueueTypeChange"
      >
        <view class="errand-form__field">
          <text class="errand-form__label">排队类型</text>
          <text class="errand-form__value">{{ QUEUE_TYPES[queueTypeIdx] }}</text>
          <text class="errand-form__arrow">›</text>
        </view>
      </picker>
    </view>

    <!-- 联系人（默认自己） -->
    <view class="errand-form__card">
      <view class="errand-form__sect-title">
        <text class="errand-form__sect-title-text">联系人</text>
      </view>
      <view class="errand-form__field">
        <text class="errand-form__label">姓名</text>
        <input
          v-model="contact.name"
          class="errand-form__input"
          placeholder="联系人姓名"
          maxlength="20"
        />
      </view>
      <view class="errand-form__field">
        <text class="errand-form__label">联系电话</text>
        <input
          v-model="contact.mobile"
          class="errand-form__input"
          type="number"
          maxlength="11"
          placeholder="11 位手机号"
        />
      </view>
    </view>

    <!-- 预估时长 / 备注 -->
    <view class="errand-form__card">
      <view class="errand-form__sect-title">
        <text class="errand-form__sect-title-text">排队信息</text>
      </view>
      <view class="errand-form__field errand-form__field--column">
        <view class="errand-form__field-head">
          <text class="errand-form__label">预估时长</text>
          <text class="errand-form__value">{{ formatDuration(queueDurationMin) }}</text>
        </view>
        <slider
          :min="MIN_DURATION_MIN"
          :max="MAX_DURATION_MIN"
          :step="STEP_DURATION_MIN"
          :value="queueDurationMin"
          show-value="false"
          activeColor="#FF6A1A"
          block-size="22"
          @change="onDurationChange"
        />
        <view class="errand-form__slider-meta">
          <text>{{ MIN_DURATION_MIN }} 分钟</text>
          <text>{{ Math.round(MAX_DURATION_MIN / 60) }} 小时</text>
        </view>
      </view>
      <picker
        mode="selector"
        :value="pickupTimeIdx"
        :range="PICKUP_TIME_OPTIONS"
        @change="onPickupTimeChange"
      >
        <view class="errand-form__field">
          <text class="errand-form__label">出发时间</text>
          <text class="errand-form__value">{{ PICKUP_TIME_OPTIONS[pickupTimeIdx] }}</text>
          <text class="errand-form__arrow">›</text>
        </view>
      </picker>
      <picker
        v-if="pickupTimeIdx === PICKUP_TIME_OPTIONS.length - 1"
        mode="time"
        :value="customTime"
        @change="onCustomTimeChange"
      >
        <view class="errand-form__field">
          <text class="errand-form__label">自定义时间</text>
          <text class="errand-form__value">{{ customTime || '请选择' }}</text>
          <text class="errand-form__arrow">›</text>
        </view>
      </picker>
      <view class="errand-form__field errand-form__field--column">
        <text class="errand-form__label">备注</text>
        <textarea
          v-model="remark"
          class="errand-form__textarea"
          placeholder="如：挂号科室、银行业务类型等（100 字以内）"
          maxlength="100"
          :auto-height="true"
        />
      </view>
    </view>

    <PriceEstimate
      :params="priceParams"
      :loading="submitting"
      hint="请填写场所 + 时长后查看费用预估"
      @priceUpdate="onPriceUpdate"
    />

    <view class="errand-form__safe" />

    <view class="errand-form__bar">
      <view class="errand-form__bar-info">
        <text class="errand-form__bar-label">合计</text>
        <text class="errand-form__bar-amount">{{ formatAmount(totalAmount) }}</text>
      </view>
      <button
        class="errand-form__bar-btn"
        :disabled="!canSubmit || submitting"
        :loading="submitting"
        @tap="onSubmit"
      >
        {{ submitting ? '提交中...' : '立即下单' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-errand/queue.vue
   * @stage P5/T5.23 (Sprint 4)
   * @desc 帮排队表单（serviceType=4）：场所 + 排队类型 + 时长滑块（30min~8h）+ 备注
   * @author 单 Agent V2.0
   */
  import { computed, reactive, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import PriceEstimate from '@/components/biz/PriceEstimate.vue'
  import { createErrandOrder, type CreateErrandParams } from '@/api/order'
  import type { ErrandPriceParams, ErrandPriceResult } from '@/types/biz'
  import { useUserStore } from '@/store/user'
  import { chooseLocation } from '@/utils/location'
  import { formatAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import { requestSubscribe } from '@/utils/subscribe'

  const QUEUE_TYPES = ['医院挂号', '银行办理', '网红店', '政务大厅', '其他'] as const
  const PICKUP_TIME_OPTIONS = ['立即出发', '1 小时后', '2 小时后', '自定义时间'] as const
  const SUBSCRIBE_TMPL_IDS: string[] = []
  const SUBMIT_THROTTLE_MS = 500
  const MIN_DURATION_MIN = 30
  const MAX_DURATION_MIN = 480
  const STEP_DURATION_MIN = 30

  interface AddressForm {
    name: string
    mobile: string
    detail: string
    lng: number
    lat: number
  }

  /** 排队不需要送达，pickup 只用于位置 */
  const pickup = reactive<AddressForm>({ name: '', mobile: '', detail: '', lng: 0, lat: 0 })
  /** 联系人（取件码送给谁） */
  const contact = reactive<{ name: string; mobile: string }>({ name: '', mobile: '' })

  const queuePlace = ref<string>('')
  const queueTypeIdx = ref<number>(0)
  const queueDurationMin = ref<number>(60)

  const pickupTimeIdx = ref<number>(0)
  const customTime = ref<string>('')
  const remark = ref<string>('')

  const submitting = ref<boolean>(false)
  const lastSubmitAt = ref<number>(0)
  const totalAmount = ref<string>('0.00')

  function computeExpectedPickupAt(): string | undefined {
    const now = new Date()
    if (pickupTimeIdx.value === 0) return undefined
    if (pickupTimeIdx.value === 1) return new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    if (pickupTimeIdx.value === 2) return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
    if (pickupTimeIdx.value === PICKUP_TIME_OPTIONS.length - 1 && customTime.value) {
      const [hh, mm] = customTime.value.split(':')
      const t = new Date()
      t.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0)
      if (t.getTime() < now.getTime()) t.setDate(t.getDate() + 1)
      return t.toISOString()
    }
    return undefined
  }

  /** 排队仅需 queueDuration 即可触发预估（pickup 坐标可选，用于按区域定价） */
  const priceParams = computed<ErrandPriceParams | null>(() => {
    if (!queueDurationMin.value) return null
    return {
      serviceType: 4,
      queueDuration: queueDurationMin.value,
      pickupLng: pickup.lng || undefined,
      pickupLat: pickup.lat || undefined
    }
  })

  const canSubmit = computed<boolean>(() => {
    return Boolean(
      queuePlace.value &&
      pickup.detail &&
      contact.name &&
      /^1\d{10}$/.test(contact.mobile) &&
      queueDurationMin.value >= MIN_DURATION_MIN &&
      Number(totalAmount.value) > 0
    )
  })

  /** 默认联系人填当前用户 */
  onLoad(() => {
    const user = useUserStore()
    if (user.profile?.mobile) {
      contact.mobile = user.profile.mobile
      contact.name = user.profile.nickname ?? ''
    }
  })

  async function onPickPlace() {
    const r = await chooseLocation()
    if (!r) return
    pickup.detail = r.address ? `${r.name} · ${r.address}` : r.name
    pickup.lng = r.lng
    pickup.lat = r.lat
    if (!queuePlace.value) queuePlace.value = r.name
  }

  function onQueueTypeChange(e: { detail: { value: string | number } }) {
    queueTypeIdx.value = Number(e.detail.value)
  }

  function onDurationChange(e: { detail: { value: number } }) {
    queueDurationMin.value = Number(e.detail.value)
  }

  function onPickupTimeChange(e: { detail: { value: string | number } }) {
    pickupTimeIdx.value = Number(e.detail.value)
  }

  function onCustomTimeChange(e: { detail: { value: string } }) {
    customTime.value = String(e.detail.value)
  }

  function onPriceUpdate(r: ErrandPriceResult) {
    totalAmount.value = r.total ?? '0.00'
  }

  /** 时长格式化：30/60/90... → 30 分钟 / 1 小时 / 1 小时 30 分钟 */
  function formatDuration(min: number): string {
    if (min < 60) return `${min} 分钟`
    const h = Math.floor(min / 60)
    const m = min % 60
    if (m === 0) return `${h} 小时`
    return `${h} 小时 ${m} 分钟`
  }

  async function onSubmit() {
    if (submitting.value) return
    const now = Date.now()
    if (now - lastSubmitAt.value < SUBMIT_THROTTLE_MS) return
    lastSubmitAt.value = now

    if (!canSubmit.value) {
      uni.showToast({ title: '请完善订单信息', icon: 'none' })
      return
    }

    track(TRACK.CLICK_PLACE_ORDER, { orderType: 2, serviceType: 4 })

    submitting.value = true
    try {
      await requestSubscribe(SUBSCRIBE_TMPL_IDS)
      const fullPlace = `${queuePlace.value} (${QUEUE_TYPES[queueTypeIdx.value]})`
      const payload: CreateErrandParams = {
        serviceType: 4,
        pickupAddress: {
          name: contact.name,
          mobile: contact.mobile,
          detail: pickup.detail,
          lng: pickup.lng,
          lat: pickup.lat
        },
        queuePlace: fullPlace,
        queueDuration: queueDurationMin.value,
        remark: remark.value || undefined,
        expectedPickupAt: computeExpectedPickupAt()
      }
      const order = await createErrandOrder(payload)
      track(TRACK.PLACE_ORDER_SUCCESS, { orderType: 2, orderNo: order.orderNo })
      uni.redirectTo({ url: `/pages/pay/index?orderNo=${encodeURIComponent(order.orderNo)}` })
    } catch (e) {
      logger.warn('errand.queue.submit.fail', { e: String(e) })
      track(TRACK.PLACE_ORDER_FAIL, { reason: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .errand-form {
    padding: 16rpx 0 200rpx;
    background: $color-bg-page;

    &__card {
      margin: 16rpx 24rpx;
      padding: 16rpx 24rpx;
      background: $color-bg-white;
      border-radius: $radius-lg;
      box-shadow: $shadow-sm;
    }

    &__sect-title {
      display: flex;
      align-items: center;
      padding: 12rpx 0 8rpx;
    }

    &__sect-title-text {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__addr-row {
      display: flex;
      gap: 16rpx;
      align-items: center;
      padding: 24rpx 0;
      border-bottom: 1rpx solid $color-divider;
    }

    &__addr-icon {
      @include flex-center;

      flex-shrink: 0;
      width: 56rpx;
      height: 56rpx;
      font-size: $font-size-base;
      font-weight: $font-weight-bold;
      color: $color-text-inverse;
      border-radius: $radius-circle;

      &--pickup {
        background: $color-primary;
      }
    }

    &__addr-body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 8rpx;
    }

    &__addr-detail {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;

      @include ellipsis(2);
    }

    &__addr-placeholder {
      font-size: $font-size-base;
      color: $color-text-placeholder;
    }

    &__addr-arrow {
      font-size: 36rpx;
      color: $color-text-placeholder;
    }

    &__field {
      display: flex;
      align-items: center;
      min-height: 88rpx;
      padding: 12rpx 0;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }

      &--column {
        flex-direction: column;
        gap: 16rpx;
        align-items: stretch;
        padding: 16rpx 0;
      }
    }

    &__field-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    &__label {
      width: 160rpx;
      font-size: $font-size-base;
      color: $color-text-regular;
    }

    &__value {
      flex: 1;
      font-size: $font-size-base;
      color: $color-text-primary;
      text-align: right;
    }

    &__arrow {
      margin-left: 8rpx;
      font-size: 32rpx;
      color: $color-text-placeholder;
    }

    &__input {
      flex: 1;
      height: 64rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      text-align: right;
    }

    &__textarea {
      width: 100%;
      min-height: 144rpx;
      padding: 16rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      background: $color-bg-page;
      border-radius: $radius-sm;
    }

    &__slider-meta {
      display: flex;
      justify-content: space-between;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__safe {
      height: 16rpx;
    }

    &__bar {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: $z-index-fixed;
      display: flex;
      gap: 16rpx;
      align-items: center;
      padding: 16rpx 24rpx env(safe-area-inset-bottom);
      background: $color-bg-white;
      box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
    }

    &__bar-info {
      display: flex;
      flex: 1;
      flex-direction: column;
    }

    &__bar-label {
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__bar-amount {
      font-size: $font-size-xl;
      font-weight: $font-weight-bold;
      color: $color-primary;
    }

    &__bar-btn {
      flex-shrink: 0;
      width: 280rpx;
      height: 80rpx;
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      line-height: 80rpx;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: 40rpx;

      &[disabled] {
        background: #ffc6a8;
      }
    }
  }
</style>
