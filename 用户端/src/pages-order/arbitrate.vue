<template>
  <view class="page arbitrate">
    <view class="arbitrate__header card">
      <view class="arbitrate__header-row">
        <text class="arbitrate__header-label">关联类型</text>
        <text class="arbitrate__header-value">{{ relatedTypeText }}</text>
      </view>
      <view class="arbitrate__header-row">
        <text class="arbitrate__header-label">关联编号</text>
        <text class="arbitrate__header-value">{{ relatedNo }}</text>
      </view>
    </view>

    <view class="arbitrate__form card">
      <view class="arbitrate__row arbitrate__row--col">
        <text class="arbitrate__label">仲裁原因</text>
        <textarea
          v-model="reason"
          class="arbitrate__textarea"
          placeholder="请详细描述仲裁原因..."
          maxlength="500"
          :auto-height="true"
        />
        <text class="arbitrate__count">{{ reason.length }}/500</text>
      </view>

      <view class="arbitrate__row arbitrate__row--col">
        <text class="arbitrate__label">凭证图（最多 9 张）</text>
        <view class="arbitrate__images">
          <view v-for="(img, i) in evidenceUrls" :key="i" class="arbitrate__img">
            <image :src="img" class="arbitrate__img-thumb" mode="aspectFill" />
            <view class="arbitrate__img-del" @tap="removeImage(i)">
              <text>×</text>
            </view>
          </view>
          <view v-if="evidenceUrls.length < 9" class="arbitrate__img-add" @tap="onChooseImage">
            <text class="arbitrate__img-add-icon">+</text>
            <text class="arbitrate__img-add-text">添加凭证</text>
          </view>
        </view>
      </view>
    </view>

    <view class="arbitrate__tip card">
      <text class="arbitrate__tip-text">
        平台将在 1-3 个工作日内审核您的仲裁申请，请确保提交真实有效的凭证。
      </text>
    </view>

    <view class="arbitrate__bottom safe-bottom">
      <view
        class="arbitrate__btn"
        :class="{ 'arbitrate__btn--disabled': !canSubmit || submitting }"
        @tap="onSubmit"
      >
        <text v-if="submitting">提交中...</text>
        <text v-else>提交仲裁</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-order/arbitrate.vue
   * @stage P5/T5.30 (Sprint 5)
   * @desc 申请仲裁：仲裁原因 + 凭证图；提交后回退上一页
   *   query: relatedNo / relatedType (1=订单 / 2=售后 / 3=投诉)
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { applyArbitration } from '@/api/order'
  import { uploadImages } from '@/api/file'
  import { logger } from '@/utils/logger'

  const ACTION_THROTTLE_MS = 500

  const TYPE_TEXT: Record<1 | 2 | 3, string> = {
    1: '订单',
    2: '售后',
    3: '投诉'
  }

  const relatedNo = ref<string>('')
  const relatedType = ref<1 | 2 | 3>(1)
  const reason = ref<string>('')
  const evidenceUrls = ref<string[]>([])
  const submitting = ref<boolean>(false)
  const lastSubmitAt = ref<number>(0)

  onLoad((options?: Record<string, string>) => {
    relatedNo.value = String(options?.relatedNo ?? '')
    const t = Number(options?.relatedType ?? 1)
    if (t === 1 || t === 2 || t === 3) relatedType.value = t
    if (!relatedNo.value) {
      uni.showToast({ title: '缺少关联编号', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
    }
  })

  const relatedTypeText = computed<string>(() => TYPE_TEXT[relatedType.value])

  const canSubmit = computed<boolean>(() => reason.value.trim().length >= 5)

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
          logger.warn('arbitrate.upload.fail', { e: String(e) })
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
    if (reason.value.trim().length < 5) {
      uni.showToast({ title: '请至少填写 5 个字', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      await applyArbitration({
        relatedNo: relatedNo.value,
        relatedType: relatedType.value,
        reason: reason.value.trim(),
        evidenceUrls: evidenceUrls.value.length > 0 ? evidenceUrls.value : undefined
      })
      uni.showToast({ title: '已提交', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } catch (e) {
      logger.warn('arbitrate.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .arbitrate {
    min-height: 100vh;
    padding-bottom: 200rpx;
    background: $color-bg-page;

    &__header {
      padding: 24rpx;
      margin: 24rpx;
    }

    &__header-row {
      display: flex;
      justify-content: space-between;
      padding: 8rpx 0;
      font-size: $font-size-sm;
    }

    &__header-label {
      color: $color-text-secondary;
    }

    &__header-value {
      color: $color-text-primary;
    }

    &__form {
      padding: 24rpx;
      margin: 24rpx;
    }

    &__row {
      display: flex;
      padding: 16rpx 0;

      &--col {
        flex-direction: column;
      }
    }

    &__label {
      margin-bottom: 12rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
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

    &__tip {
      padding: 24rpx;
      margin: 0 24rpx;
      background: rgba(255, 106, 26, 0.08);
    }

    &__tip-text {
      font-size: $font-size-xs;
      line-height: 1.6;
      color: $color-text-regular;
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
