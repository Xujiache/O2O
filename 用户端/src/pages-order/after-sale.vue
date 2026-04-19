<template>
  <view class="page after-sale">
    <BizLoading v-if="loadingOrder" fullscreen text="加载中..." />

    <template v-if="order">
      <view class="after-sale__order card">
        <view class="after-sale__order-row">
          <text class="after-sale__order-label">订单编号</text>
          <text class="after-sale__order-value">{{ order.orderNo }}</text>
        </view>
        <view class="after-sale__order-row">
          <text class="after-sale__order-label">订单金额</text>
          <text class="after-sale__order-value">{{ formatAmount(order.payAmount) }}</text>
        </view>
      </view>

      <view class="after-sale__form card">
        <view class="after-sale__row">
          <text class="after-sale__label">售后类型</text>
          <picker
            mode="selector"
            :range="reasonOptions"
            :value="reasonIndex"
            @change="onReasonChange"
          >
            <view class="after-sale__picker">
              <text class="after-sale__picker-text">
                {{ reasonOptions[reasonIndex] || '请选择' }}
              </text>
              <text class="after-sale__picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <view class="after-sale__row">
          <text class="after-sale__label">退款金额</text>
          <view class="after-sale__amount-input">
            <text class="after-sale__amount-prefix">¥</text>
            <input
              v-model="refundAmount"
              type="digit"
              class="after-sale__input"
              placeholder="请输入退款金额"
              @blur="clampAmount"
            />
            <text class="after-sale__amount-max" @tap="setMaxAmount">最高 ¥{{ maxAmount }}</text>
          </view>
        </view>

        <view class="after-sale__row after-sale__row--col">
          <text class="after-sale__label">详细说明</text>
          <textarea
            v-model="description"
            class="after-sale__textarea"
            placeholder="请描述具体问题..."
            maxlength="200"
            :auto-height="true"
          />
          <text class="after-sale__count">{{ description.length }}/200</text>
        </view>

        <view class="after-sale__row after-sale__row--col">
          <text class="after-sale__label">凭证图（最多 9 张）</text>
          <view class="after-sale__images">
            <view v-for="(img, i) in evidenceUrls" :key="i" class="after-sale__img">
              <image :src="img" class="after-sale__img-thumb" mode="aspectFill" />
              <view class="after-sale__img-del" @tap="removeImage(i)">
                <text>×</text>
              </view>
            </view>
            <view v-if="evidenceUrls.length < 9" class="after-sale__img-add" @tap="onChooseImage">
              <text class="after-sale__img-add-icon">+</text>
              <text class="after-sale__img-add-text">添加凭证</text>
            </view>
          </view>
        </view>
      </view>

      <view class="after-sale__bottom safe-bottom">
        <view
          class="after-sale__submit-btn"
          :class="{ 'after-sale__submit-btn--disabled': !canSubmit || submitting }"
          @tap="onSubmit"
        >
          <text v-if="submitting">提交中...</text>
          <text v-else>提交申请</text>
        </view>
      </view>
    </template>

    <BizEmpty v-else-if="!loadingOrder" text="订单不存在" />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-order/after-sale.vue
   * @stage P5/T5.30 (Sprint 5)
   * @desc 售后申请：选择售后类型 + 退款金额 + 说明 + 凭证图（最多 9 张）
   *   提交成功后跳转 /pages-order/after-sale-detail?id=xxx
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import { getOrderDetail, applyAfterSale } from '@/api/order'
  import { uploadImages } from '@/api/file'
  import type { OrderTakeout, OrderErrand } from '@/types/biz'
  import { formatAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  const ACTION_THROTTLE_MS = 500

  const reasonOptions = ['仅退款', '退款退货', '商品质量问题', '配送问题', '其他'] as const

  const orderNo = ref<string>('')
  const order = ref<OrderTakeout | OrderErrand | null>(null)
  const loadingOrder = ref<boolean>(false)
  const reasonIndex = ref<number>(0)
  const refundAmount = ref<string>('0.00')
  const description = ref<string>('')
  const evidenceUrls = ref<string[]>([])
  const submitting = ref<boolean>(false)
  const lastSubmitAt = ref<number>(0)

  onLoad((options?: Record<string, string>) => {
    orderNo.value = String(options?.orderNo ?? '')
    track(TRACK.CLICK_AFTER_SALE, { orderNo: orderNo.value, from: 'after_sale_page' })
    if (!orderNo.value) {
      uni.showToast({ title: '缺少订单编号', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    void loadOrder()
  })

  async function loadOrder() {
    loadingOrder.value = true
    try {
      const r = await getOrderDetail(orderNo.value)
      order.value = r
      refundAmount.value = r.payAmount
    } catch (e) {
      logger.warn('after.sale.order.fail', { orderNo: orderNo.value, e: String(e) })
    } finally {
      loadingOrder.value = false
    }
  }

  const maxAmount = computed<string>(() => order.value?.payAmount ?? '0.00')

  const canSubmit = computed<boolean>(() => {
    return (
      !!order.value &&
      reasonIndex.value >= 0 &&
      parseFloat(refundAmount.value || '0') > 0 &&
      parseFloat(refundAmount.value || '0') <= parseFloat(maxAmount.value)
    )
  })

  function onReasonChange(e: { detail: { value: string | number } }) {
    reasonIndex.value = Number(e.detail.value)
  }

  function clampAmount() {
    const v = parseFloat(refundAmount.value || '0')
    const max = parseFloat(maxAmount.value)
    if (Number.isNaN(v) || v < 0) {
      refundAmount.value = '0.00'
      return
    }
    if (v > max) {
      refundAmount.value = maxAmount.value
      uni.showToast({ title: `最多退款 ¥${maxAmount.value}`, icon: 'none' })
    }
  }

  function setMaxAmount() {
    refundAmount.value = maxAmount.value
  }

  function onChooseImage() {
    const remain = 9 - evidenceUrls.value.length
    if (remain <= 0) return
    uni.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempPaths = res.tempFilePaths
        if (!tempPaths.length) return
        try {
          uni.showLoading({ title: '上传中...', mask: true })
          const list = await uploadImages(tempPaths, 'proof', false)
          evidenceUrls.value = [...evidenceUrls.value, ...list.map((x) => x.url)]
        } catch (e) {
          uni.showToast({ title: '上传失败', icon: 'none' })
          logger.warn('after.sale.upload.fail', { e: String(e) })
        } finally {
          uni.hideLoading()
        }
      }
    })
  }

  function removeImage(idx: number) {
    evidenceUrls.value = evidenceUrls.value.filter((_, i) => i !== idx)
  }

  async function onSubmit() {
    if (!canSubmit.value || submitting.value) return
    const t = Date.now()
    if (t - lastSubmitAt.value < ACTION_THROTTLE_MS) return
    lastSubmitAt.value = t
    submitting.value = true
    try {
      const r = await applyAfterSale({
        orderNo: orderNo.value,
        reason: reasonOptions[reasonIndex.value],
        refundAmount: refundAmount.value,
        description: description.value || undefined,
        evidenceUrls: evidenceUrls.value.length > 0 ? evidenceUrls.value : undefined
      })
      track(TRACK.SUBMIT_AFTER_SALE, { orderNo: orderNo.value, id: r.id })
      uni.showToast({ title: '已提交', icon: 'success' })
      setTimeout(() => {
        uni.redirectTo({ url: `/pages-order/after-sale-detail?id=${r.id}` })
      }, 600)
    } catch (e) {
      logger.warn('after.sale.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .after-sale {
    min-height: 100vh;
    padding-bottom: 200rpx;
    background: $color-bg-page;

    &__order {
      padding: 24rpx;
      margin: 24rpx;
    }

    &__order-row {
      display: flex;
      justify-content: space-between;
      padding: 8rpx 0;
      font-size: $font-size-sm;
    }

    &__order-label {
      color: $color-text-secondary;
    }

    &__order-value {
      color: $color-text-primary;
    }

    &__form {
      padding: 24rpx;
      margin: 24rpx;
    }

    &__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24rpx 0;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }

      &--col {
        flex-direction: column;
        align-items: stretch;
      }
    }

    &__label {
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__picker {
      display: flex;
      align-items: center;
    }

    &__picker-text {
      font-size: $font-size-base;
      color: $color-text-regular;
    }

    &__picker-arrow {
      margin-left: 8rpx;
      font-size: $font-size-md;
      color: $color-text-secondary;
    }

    &__amount-input {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: flex-end;
      gap: 8rpx;
    }

    &__amount-prefix {
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__input {
      flex: 1;
      max-width: 240rpx;
      font-size: $font-size-base;
      text-align: right;
    }

    &__amount-max {
      font-size: $font-size-xs;
      color: $color-primary;
    }

    &__textarea {
      width: 100%;
      min-height: 192rpx;
      padding: 16rpx;
      margin-top: 16rpx;
      font-size: $font-size-sm;
      color: $color-text-primary;
      background: $color-bg-page;
      border-radius: $radius-sm;
    }

    &__count {
      margin-top: 8rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
      text-align: right;
    }

    &__images {
      display: flex;
      flex-wrap: wrap;
      gap: 16rpx;
      margin-top: 16rpx;
    }

    &__img {
      position: relative;
      width: 160rpx;
      height: 160rpx;
    }

    &__img-thumb {
      width: 100%;
      height: 100%;
      background-color: $color-divider;
      border-radius: $radius-sm;
    }

    &__img-del {
      @include flex-center;

      position: absolute;
      top: -12rpx;
      right: -12rpx;
      width: 36rpx;
      height: 36rpx;
      font-size: 28rpx;
      line-height: 1;
      color: $color-text-inverse;
      background: rgba(0, 0, 0, 0.6);
      border-radius: $radius-circle;
    }

    &__img-add {
      @include flex-center;

      flex-direction: column;
      width: 160rpx;
      height: 160rpx;
      background: $color-bg-page;
      border: 1rpx dashed $color-border;
      border-radius: $radius-sm;
    }

    &__img-add-icon {
      font-size: 56rpx;
      line-height: 1;
      color: $color-text-secondary;
    }

    &__img-add-text {
      margin-top: 4rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__bottom {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      padding: 24rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;
    }

    &__submit-btn {
      @include flex-center;

      height: 88rpx;
      font-size: $font-size-md;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-lg;

      &--disabled {
        background: #ffc6a8;
      }
    }
  }
</style>
