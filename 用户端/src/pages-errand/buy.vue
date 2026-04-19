<template>
  <view class="page errand-form">
    <!-- 购买地址（商家/超市） -->
    <view class="errand-form__card">
      <view class="errand-form__sect-title">
        <text class="errand-form__sect-title-text">购买地点</text>
      </view>
      <view class="errand-form__addr-row" @tap="onPickPickup">
        <view class="errand-form__addr-icon errand-form__addr-icon--pickup">
          <text>购</text>
        </view>
        <view class="errand-form__addr-body">
          <text v-if="pickup.detail" class="errand-form__addr-detail">{{ pickup.detail }}</text>
          <text v-else class="errand-form__addr-placeholder">点击选择购买地点（超市/餐厅）</text>
          <text v-if="pickup.detail" class="errand-form__addr-extra">商家联系电话仅作备用</text>
        </view>
        <text class="errand-form__addr-arrow">›</text>
      </view>
      <view v-if="pickup.detail" class="errand-form__inline">
        <view class="errand-form__field">
          <text class="errand-form__label">商家名称</text>
          <input
            v-model="pickup.name"
            class="errand-form__input"
            placeholder="如：山姆会员店"
            maxlength="20"
          />
        </view>
        <view class="errand-form__field">
          <text class="errand-form__label">商家电话</text>
          <input
            v-model="pickup.mobile"
            class="errand-form__input"
            type="number"
            maxlength="11"
            placeholder="可空"
          />
        </view>
      </view>
    </view>

    <!-- 送达地址 -->
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

    <!-- 商品清单 -->
    <view class="errand-form__card">
      <view class="errand-form__sect-title">
        <text class="errand-form__sect-title-text">商品清单</text>
        <text class="errand-form__sect-title-tip">每行：商品名 数量 备注</text>
      </view>
      <view class="errand-form__field errand-form__field--column">
        <textarea
          v-model="buyList"
          class="errand-form__textarea errand-form__textarea--lg"
          placeholder="例：&#10;农夫山泉 5 大瓶&#10;鸡蛋 1盒 选大的&#10;..."
          maxlength="500"
          :auto-height="true"
        />
      </view>
      <view class="errand-form__field errand-form__field--column">
        <view class="errand-form__field-head">
          <text class="errand-form__label">商品图片</text>
          <text class="errand-form__sect-title-tip">最多 3 张（可空）</text>
        </view>
        <view class="errand-form__upload-grid">
          <view
            v-for="(url, i) in images"
            :key="`${i}-${url}`"
            class="errand-form__upload-cell"
            @tap="onPreview(i)"
          >
            <image class="errand-form__upload-img" :src="url" mode="aspectFill" />
            <view class="errand-form__upload-del" @tap.stop="onRemoveImage(i)">
              <text class="errand-form__upload-del-text">×</text>
            </view>
          </view>
          <view
            v-if="images.length < MAX_IMAGES"
            class="errand-form__upload-cell errand-form__upload-cell--add"
            @tap="onAddImage"
          >
            <text class="errand-form__upload-add">+</text>
          </view>
        </view>
        <view v-if="uploading" class="errand-form__upload-hint">
          <text>上传中...</text>
        </view>
      </view>
      <view class="errand-form__field">
        <text class="errand-form__label">预算金额</text>
        <input
          v-model="budget"
          class="errand-form__input"
          type="digit"
          placeholder="单位元，骑手垫付不得超出"
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
          <text class="errand-form__label">购买时间</text>
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
      hint="请填写完整地址 + 预算后查看费用预估"
      @priceUpdate="onPriceUpdate"
    />

    <view class="errand-form__safe" />

    <view class="errand-form__bar">
      <view class="errand-form__bar-info">
        <text class="errand-form__bar-label"
          >合计（含商品预算 {{ formatAmount(budget || '0') }}）</text
        >
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
   * @file pages-errand/buy.vue
   * @stage P5/T5.23 (Sprint 4)
   * @desc 帮买表单（serviceType=3）：购买地址 + 商品清单 + 商品图 + 预算金额 + 送达地址
   * @author 单 Agent V2.0
   */
  import { computed, reactive, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import PriceEstimate from '@/components/biz/PriceEstimate.vue'
  import { createErrandOrder, type CreateErrandParams } from '@/api/order'
  import type { ErrandPriceParams, ErrandPriceResult } from '@/types/biz'
  import { useUserStore } from '@/store/user'
  import { chooseLocation } from '@/utils/location'
  import { uploadImages } from '@/api/file'
  import { addAmount, formatAmount, maskMobile } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'
  import { requestSubscribe } from '@/utils/subscribe'

  const PICKUP_TIME_OPTIONS = ['立即购买', '1 小时后', '2 小时后', '自定义时间'] as const
  const SUBSCRIBE_TMPL_IDS: string[] = []
  const SUBMIT_THROTTLE_MS = 500
  const MAX_IMAGES = 3

  interface AddressForm {
    name: string
    mobile: string
    detail: string
    lng: number
    lat: number
  }

  const pickup = reactive<AddressForm>({ name: '', mobile: '', detail: '', lng: 0, lat: 0 })
  const delivery = reactive<AddressForm>({ name: '', mobile: '', detail: '', lng: 0, lat: 0 })

  const buyList = ref<string>('')
  const budget = ref<string>('')
  const images = ref<string[]>([])
  const uploading = ref<boolean>(false)

  const pickupTimeIdx = ref<number>(0)
  const customTime = ref<string>('')
  const remark = ref<string>('')

  const submitting = ref<boolean>(false)
  const lastSubmitAt = ref<number>(0)
  /** 仅运费部分（不含预算） */
  const feeAmount = ref<string>('0.00')
  /** 含预算的合计金额（用户实际看到） */
  const totalAmount = computed<string>(() => addAmount(feeAmount.value || '0', budget.value || '0'))

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
      serviceType: 3,
      pickupLng: pickup.lng,
      pickupLat: pickup.lat,
      deliveryLng: delivery.lng,
      deliveryLat: delivery.lat,
      budget: budget.value || undefined
    }
  })

  const canSubmit = computed<boolean>(() => {
    return Boolean(
      pickup.detail &&
      delivery.detail &&
      delivery.name &&
      /^1\d{10}$/.test(delivery.mobile) &&
      buyList.value.trim() &&
      Number(budget.value) > 0 &&
      Number(feeAmount.value) > 0
    )
  })

  /** 默认收件人填当前用户手机号 */
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
    pickup.name = pickup.name || r.name
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

  function onPickupTimeChange(e: { detail: { value: string | number } }) {
    pickupTimeIdx.value = Number(e.detail.value)
  }

  function onCustomTimeChange(e: { detail: { value: string } }) {
    customTime.value = String(e.detail.value)
  }

  function onPriceUpdate(r: ErrandPriceResult) {
    feeAmount.value = r.total ?? '0.00'
  }

  function formatMobileForDisplay(m: string): string {
    return maskMobile(m)
  }

  /** 选图 + 上传到 /file/upload bizModule=temp */
  function onAddImage() {
    if (uploading.value) return
    const remain = MAX_IMAGES - images.value.length
    if (remain <= 0) return
    uni.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const paths = res.tempFilePaths
        if (!paths || paths.length === 0) return
        uploading.value = true
        try {
          const uploaded = await uploadImages(paths, 'temp', true)
          images.value = [...images.value, ...uploaded.map((u) => u.url)]
        } catch (e) {
          logger.warn('errand.buy.upload.fail', { e: String(e) })
          uni.showToast({ title: '图片上传失败', icon: 'none' })
        } finally {
          uploading.value = false
        }
      },
      fail: (err) => {
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          logger.warn('errand.buy.choose.fail', { err: String(err.errMsg) })
        }
      }
    })
  }

  function onRemoveImage(idx: number) {
    images.value = images.value.filter((_, i) => i !== idx)
  }

  function onPreview(idx: number) {
    if (images.value.length === 0) return
    uni.previewImage({ current: images.value[idx], urls: [...images.value] })
  }

  /** buyList 字符串拼接：商品 + 图片 URL（图片以行注释形式） */
  function buildBuyListText(): string {
    const list = buyList.value.trim()
    if (images.value.length === 0) return list
    return `${list}\n[图片]\n${images.value.join('\n')}`
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

    track(TRACK.CLICK_PLACE_ORDER, { orderType: 2, serviceType: 3 })

    submitting.value = true
    try {
      await requestSubscribe(SUBSCRIBE_TMPL_IDS)
      const payload: CreateErrandParams = {
        serviceType: 3,
        pickupAddress: { ...pickup },
        deliveryAddress: { ...delivery },
        buyList: buildBuyListText(),
        budget: budget.value,
        remark: remark.value || undefined,
        expectedPickupAt: computeExpectedPickupAt()
      }
      const order = await createErrandOrder(payload)
      track(TRACK.PLACE_ORDER_SUCCESS, { orderType: 2, orderNo: order.orderNo })
      uni.redirectTo({ url: `/pages/pay/index?orderNo=${encodeURIComponent(order.orderNo)}` })
    } catch (e) {
      logger.warn('errand.buy.submit.fail', { e: String(e) })
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
      align-items: baseline;
      justify-content: space-between;
      padding: 12rpx 0 8rpx;
    }

    &__sect-title-text {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__sect-title-tip {
      font-size: $font-size-xs;
      color: $color-text-secondary;
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

      &--lg {
        min-height: 200rpx;
      }
    }

    &__upload-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16rpx;
    }

    &__upload-cell {
      position: relative;
      flex: 0 0 calc((100% - 32rpx) / 3);
      aspect-ratio: 1;
      overflow: hidden;
      background: $color-bg-page;
      border-radius: $radius-md;

      &--add {
        @include flex-center;

        border: 2rpx dashed $color-border;
      }
    }

    &__upload-img {
      width: 100%;
      height: 100%;
    }

    &__upload-add {
      font-size: 64rpx;
      font-weight: 300;
      color: $color-text-placeholder;
    }

    &__upload-del {
      @include flex-center;

      position: absolute;
      top: 4rpx;
      right: 4rpx;
      width: 36rpx;
      height: 36rpx;
      background: rgba(0, 0, 0, 0.5);
      border-radius: $radius-circle;
    }

    &__upload-del-text {
      font-size: 28rpx;
      color: $color-text-inverse;
    }

    &__upload-hint {
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
