<template>
  <view class="page complaint">
    <view class="complaint__order card">
      <view class="complaint__order-row">
        <text class="complaint__order-label">订单编号</text>
        <text class="complaint__order-value">{{ orderNo }}</text>
      </view>
    </view>

    <view class="complaint__form card">
      <view class="complaint__row complaint__row--col">
        <text class="complaint__label">投诉对象</text>
        <view class="complaint__chips">
          <view
            v-for="t in targetOptions"
            :key="t.value"
            class="complaint__chip"
            :class="{ 'complaint__chip--active': targetType === t.value }"
            @tap="onTargetChange(t.value)"
          >
            <text>{{ t.label }}</text>
          </view>
        </view>
      </view>

      <view class="complaint__row">
        <text class="complaint__label">投诉原因</text>
        <picker
          mode="selector"
          :range="reasonOptions"
          :value="reasonIndex"
          @change="onReasonChange"
        >
          <view class="complaint__picker">
            <text class="complaint__picker-text">
              {{ reasonOptions[reasonIndex] || '请选择' }}
            </text>
            <text class="complaint__picker-arrow">›</text>
          </view>
        </picker>
      </view>

      <view v-if="isCustomReason" class="complaint__row complaint__row--col">
        <text class="complaint__label">自定义原因</text>
        <input
          v-model="customReason"
          class="complaint__input"
          placeholder="请输入自定义原因"
          maxlength="50"
        />
      </view>

      <view class="complaint__row complaint__row--col">
        <text class="complaint__label">详细描述</text>
        <textarea
          v-model="description"
          class="complaint__textarea"
          placeholder="请详细描述投诉问题..."
          maxlength="500"
          :auto-height="true"
        />
        <text class="complaint__count">{{ description.length }}/500</text>
      </view>

      <view class="complaint__row complaint__row--col">
        <text class="complaint__label">凭证图（最多 9 张）</text>
        <view class="complaint__images">
          <view v-for="(img, i) in evidenceUrls" :key="i" class="complaint__img">
            <image :src="img" class="complaint__img-thumb" mode="aspectFill" />
            <view class="complaint__img-del" @tap="removeImage(i)">
              <text>×</text>
            </view>
          </view>
          <view v-if="evidenceUrls.length < 9" class="complaint__img-add" @tap="onChooseImage">
            <text class="complaint__img-add-icon">+</text>
            <text class="complaint__img-add-text">添加凭证</text>
          </view>
        </view>
      </view>
    </view>

    <view class="complaint__bottom safe-bottom">
      <view
        class="complaint__btn"
        :class="{ 'complaint__btn--disabled': !canSubmit || submitting }"
        @tap="onSubmit"
      >
        <text v-if="submitting">提交中...</text>
        <text v-else>提交投诉</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-order/complaint.vue
   * @stage P5/T5.31 (Sprint 5)
   * @desc 投诉表单：投诉对象（商家/骑手/平台）+ 原因（picker + 自定义）+ 描述 + 凭证图
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { applyComplaint } from '@/api/order'
  import { uploadImages } from '@/api/file'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  const ACTION_THROTTLE_MS = 500

  /** 投诉对象（与 api/order.ts 的 targetType 对齐：1=用户/2=商家/3=骑手；
   *  此处用户场景下展示商家/骑手/平台三选一，平台映射为 targetType=2 商家上级渠道默认填 2） */
  const targetOptions: Array<{ label: string; value: 1 | 2 | 3 }> = [
    { label: '商家', value: 2 },
    { label: '骑手', value: 3 },
    { label: '平台', value: 1 }
  ]

  const reasonOptions = [
    '商品/服务质量问题',
    '态度恶劣',
    '配送严重超时',
    '虚假宣传',
    '骚扰/威胁',
    '其他'
  ] as const

  const orderNo = ref<string>('')
  const targetType = ref<1 | 2 | 3>(2)
  const reasonIndex = ref<number>(0)
  const customReason = ref<string>('')
  const description = ref<string>('')
  const evidenceUrls = ref<string[]>([])
  const submitting = ref<boolean>(false)
  const lastSubmitAt = ref<number>(0)

  onLoad((options?: Record<string, string>) => {
    orderNo.value = String(options?.orderNo ?? '')
    track(TRACK.CLICK_COMPLAINT, { orderNo: orderNo.value, from: 'complaint_page' })
    if (!orderNo.value) {
      uni.showToast({ title: '缺少订单编号', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
    }
  })

  const isCustomReason = computed<boolean>(() => reasonOptions[reasonIndex.value] === '其他')

  const canSubmit = computed<boolean>(() => {
    if (!orderNo.value) return false
    if (description.value.trim().length < 5) return false
    if (isCustomReason.value && customReason.value.trim().length < 2) return false
    return true
  })

  function onTargetChange(v: 1 | 2 | 3) {
    targetType.value = v
  }

  function onReasonChange(e: { detail: { value: string | number } }) {
    reasonIndex.value = Number(e.detail.value)
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
          logger.warn('complaint.upload.fail', { e: String(e) })
        } finally {
          uni.hideLoading()
        }
      }
    })
  }

  function removeImage(idx: number) {
    evidenceUrls.value = evidenceUrls.value.filter((_, i) => i !== idx)
  }

  function buildReason(): string {
    const main = isCustomReason.value ? customReason.value.trim() : reasonOptions[reasonIndex.value]
    return `[${main}] ${description.value.trim()}`
  }

  async function onSubmit() {
    if (!canSubmit.value || submitting.value) return
    const t = Date.now()
    if (t - lastSubmitAt.value < ACTION_THROTTLE_MS) return
    lastSubmitAt.value = t
    submitting.value = true
    try {
      await applyComplaint({
        orderNo: orderNo.value,
        targetType: targetType.value,
        reason: buildReason(),
        evidenceUrls: evidenceUrls.value.length > 0 ? evidenceUrls.value : undefined
      })
      uni.showToast({ title: '投诉已提交', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('complaint.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .complaint {
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
      margin-bottom: 12rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__chips {
      display: flex;
      gap: 16rpx;
      flex-wrap: wrap;
    }

    &__chip {
      padding: 12rpx 32rpx;
      font-size: $font-size-sm;
      color: $color-text-regular;
      background: $color-bg-page;
      border: 1rpx solid $color-border;
      border-radius: $radius-lg;

      &--active {
        color: $color-primary;
        background: rgba(255, 106, 26, 0.1);
        border-color: $color-primary;
      }
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

    &__input {
      width: 100%;
      padding: 16rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      background: $color-bg-page;
      border-radius: $radius-sm;
    }

    &__textarea {
      width: 100%;
      min-height: 240rpx;
      padding: 16rpx;
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

    &__btn {
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
