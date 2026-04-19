<template>
  <view class="page errand-form">
    <!-- 取件地址（商家/取件点） -->
    <view class="errand-form__card">
      <view class="errand-form__sect-title">
        <text class="errand-form__sect-title-text">取件地点</text>
      </view>
      <view class="errand-form__addr-row" @tap="onPickPickup">
        <view class="errand-form__addr-icon errand-form__addr-icon--pickup">
          <text>取</text>
        </view>
        <view class="errand-form__addr-body">
          <text v-if="pickup.detail" class="errand-form__addr-detail">{{ pickup.detail }}</text>
          <text v-else class="errand-form__addr-placeholder">点击选择取件地点（商家/快递柜）</text>
          <text v-if="pickup.detail" class="errand-form__addr-extra">
            {{ pickup.name || '联系人' }} · {{ formatMobileForDisplay(pickup.mobile) }}
          </text>
        </view>
        <text class="errand-form__addr-arrow">›</text>
      </view>
      <view v-if="pickup.detail" class="errand-form__inline">
        <view class="errand-form__field">
          <text class="errand-form__label">取件联系人</text>
          <input
            v-model="pickup.name"
            class="errand-form__input"
            placeholder="商家/收件人姓名"
            maxlength="20"
          />
        </view>
        <view class="errand-form__field">
          <text class="errand-form__label">联系电话</text>
          <input
            v-model="pickup.mobile"
            class="errand-form__input"
            type="number"
            maxlength="11"
            placeholder="11 位手机号"
          />
        </view>
      </view>
    </view>

    <!-- 收件人（自己） -->
    <view class="errand-form__card">
      <view class="errand-form__sect-title">
        <text class="errand-form__sect-title-text">送达地址</text>
      </view>
      <view class="errand-form__addr-row" @tap="onPickDelivery">
        <view class="errand-form__addr-icon errand-form__addr-icon--delivery">
          <text>送</text>
        </view>
        <view class="errand-form__addr-body">
          <text v-if="delivery.detail" class="errand-form__addr-detail">{{ delivery.detail }}</text>
          <text v-else class="errand-form__addr-placeholder">点击选择送达地址</text>
          <text v-if="delivery.detail" class="errand-form__addr-extra">
            {{ delivery.name || '收件人' }} · {{ formatMobileForDisplay(delivery.mobile) }}
          </text>
        </view>
        <text class="errand-form__addr-arrow">›</text>
      </view>
      <view v-if="delivery.detail" class="errand-form__inline">
        <view class="errand-form__field">
          <text class="errand-form__label">收件人</text>
          <input
            v-model="delivery.name"
            class="errand-form__input"
            placeholder="姓名"
            maxlength="20"
          />
        </view>
        <view class="errand-form__field">
          <text class="errand-form__label">联系电话</text>
          <input
            v-model="delivery.mobile"
            class="errand-form__input"
            type="number"
            maxlength="11"
            placeholder="11 位手机号"
          />
        </view>
      </view>
    </view>

    <!-- 物品信息 -->
    <view class="errand-form__card">
      <view class="errand-form__sect-title">
        <text class="errand-form__sect-title-text">物品信息</text>
      </view>
      <view class="errand-form__field errand-form__field--column">
        <text class="errand-form__label">物品描述</text>
        <textarea
          v-model="itemDesc"
          class="errand-form__textarea"
          placeholder="请描述物品（快递、文件、外卖等），50 字内"
          maxlength="50"
          :auto-height="true"
        />
      </view>
      <view class="errand-form__field errand-form__field--column">
        <view class="errand-form__field-head">
          <text class="errand-form__label">预估重量</text>
          <text class="errand-form__value">{{ weight }} kg</text>
        </view>
        <slider
          :min="1"
          :max="30"
          :step="1"
          :value="weight"
          show-value="false"
          activeColor="#FF6A1A"
          block-size="22"
          @change="onWeightChange"
        />
      </view>
      <view class="errand-form__field">
        <text class="errand-form__label">保价金额</text>
        <input
          v-model="insurance"
          class="errand-form__input"
          type="digit"
          placeholder="可空，单位元"
          maxlength="6"
        />
        <text class="errand-form__suffix">元</text>
      </view>
    </view>

    <!-- 取件时间 / 备注 -->
    <view class="errand-form__card">
      <picker
        mode="selector"
        :value="pickupTimeIdx"
        :range="PICKUP_TIME_OPTIONS"
        @change="onPickupTimeChange"
      >
        <view class="errand-form__field">
          <text class="errand-form__label">取件时间</text>
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
          placeholder="可备注（100 字以内）"
          maxlength="100"
          :auto-height="true"
        />
      </view>
    </view>

    <PriceEstimate
      :params="priceParams"
      :loading="submitting"
      hint="请填写完整地址 + 重量后查看费用预估"
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
   * @file pages-errand/pickup.vue
   * @stage P5/T5.23 (Sprint 4)
   * @desc 帮取表单（serviceType=2）：商家/取件点 → 自己；逆向流程，物品描述 + 保价
   * @author 单 Agent V2.0
   */
  import { computed, reactive, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import PriceEstimate from '@/components/biz/PriceEstimate.vue'
  import { createErrandOrder, type CreateErrandParams } from '@/api/order'
  import type { ErrandPriceParams, ErrandPriceResult } from '@/types/biz'
  import { useUserStore } from '@/store/user'
  import { chooseLocation } from '@/utils/location'
  import { formatAmount, maskMobile } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import { requestSubscribe } from '@/utils/subscribe'

  const PICKUP_TIME_OPTIONS = ['立即取件', '1 小时后', '2 小时后', '自定义时间'] as const
  const SUBSCRIBE_TMPL_IDS: string[] = []
  const SUBMIT_THROTTLE_MS = 500

  interface AddressForm {
    name: string
    mobile: string
    detail: string
    lng: number
    lat: number
  }

  const pickup = reactive<AddressForm>({ name: '', mobile: '', detail: '', lng: 0, lat: 0 })
  const delivery = reactive<AddressForm>({ name: '', mobile: '', detail: '', lng: 0, lat: 0 })

  const itemDesc = ref<string>('')
  const weight = ref<number>(2)
  const insurance = ref<string>('')

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

  const priceParams = computed<ErrandPriceParams | null>(() => {
    if (!pickup.lng || !pickup.lat || !delivery.lng || !delivery.lat) return null
    return {
      serviceType: 2,
      pickupLng: pickup.lng,
      pickupLat: pickup.lat,
      deliveryLng: delivery.lng,
      deliveryLat: delivery.lat,
      weight: weight.value,
      insurance: insurance.value ? Number(insurance.value) || 0 : undefined
    }
  })

  const canSubmit = computed<boolean>(() => {
    return Boolean(
      pickup.detail &&
      pickup.name &&
      /^1\d{10}$/.test(pickup.mobile) &&
      delivery.detail &&
      delivery.name &&
      /^1\d{10}$/.test(delivery.mobile) &&
      itemDesc.value &&
      weight.value > 0 &&
      Number(totalAmount.value) > 0
    )
  })

  /** 默认收件人（自己）填当前用户手机号 */
  onLoad(() => {
    const user = useUserStore()
    if (user.profile?.mobile) {
      delivery.mobile = user.profile.mobile
      delivery.name = user.profile.nickname ?? ''
    }
  })

  async function onPickPickup() {
    const r = await chooseLocation()
    if (!r) return
    pickup.detail = r.address ? `${r.name} · ${r.address}` : r.name
    pickup.lng = r.lng
    pickup.lat = r.lat
  }

  async function onPickDelivery() {
    const r = await chooseLocation()
    if (!r) return
    delivery.detail = r.address ? `${r.name} · ${r.address}` : r.name
    delivery.lng = r.lng
    delivery.lat = r.lat
  }

  function onWeightChange(e: { detail: { value: number } }) {
    weight.value = Number(e.detail.value)
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

  function formatMobileForDisplay(m: string): string {
    return maskMobile(m)
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

    track(TRACK.CLICK_PLACE_ORDER, { orderType: 2, serviceType: 2 })

    submitting.value = true
    try {
      await requestSubscribe(SUBSCRIBE_TMPL_IDS)
      const payload: CreateErrandParams = {
        serviceType: 2,
        pickupAddress: { ...pickup },
        deliveryAddress: { ...delivery },
        itemDescription: itemDesc.value,
        weight: weight.value,
        insurance: insurance.value ? Number(insurance.value) : undefined,
        remark: remark.value || undefined,
        expectedPickupAt: computeExpectedPickupAt()
      }
      const order = await createErrandOrder(payload)
      track(TRACK.PLACE_ORDER_SUCCESS, { orderType: 2, orderNo: order.orderNo })
      uni.redirectTo({ url: `/pages/pay/index?orderNo=${encodeURIComponent(order.orderNo)}` })
    } catch (e) {
      logger.warn('errand.pickup.submit.fail', { e: String(e) })
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

      &--delivery {
        background: $color-success;
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

    &__addr-extra {
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__addr-arrow {
      font-size: 36rpx;
      color: $color-text-placeholder;
    }

    &__inline {
      padding-top: 8rpx;
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

    &__suffix {
      margin-left: 8rpx;
      font-size: $font-size-base;
      color: $color-text-regular;
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
