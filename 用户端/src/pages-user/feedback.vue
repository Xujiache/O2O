<template>
  <view class="page page-white feedback">
    <view class="feedback__sec">
      <text class="feedback__sec-title">问题分类</text>
      <view class="feedback__cats">
        <view
          v-for="c in categories"
          :key="c.value"
          class="feedback__cat"
          :class="{ 'feedback__cat--active': form.category === c.value }"
          @tap="form.category = c.value"
        >
          <text>{{ c.label }}</text>
        </view>
      </view>
    </view>

    <view class="feedback__sec">
      <text class="feedback__sec-title">详细描述</text>
      <textarea
        v-model="form.content"
        class="feedback__textarea"
        placeholder="请尽量描述清楚问题或建议，方便我们更快解决（不超过 300 字）"
        maxlength="300"
        auto-height
      />
      <view class="feedback__counter">{{ form.content.length }}/300</view>
    </view>

    <view class="feedback__sec">
      <text class="feedback__sec-title">截图（可选，最多 3 张）</text>
      <view class="feedback__images">
        <view v-for="(url, i) in form.imageUrls" :key="i" class="feedback__image">
          <image class="feedback__image-img" :src="url" mode="aspectFill" />
          <view class="feedback__image-del" @tap="onDelImage(i)">
            <text>×</text>
          </view>
        </view>
        <view v-if="form.imageUrls.length < 3" class="feedback__image-add" @tap="onChoose">
          <text>+</text>
        </view>
      </view>
    </view>

    <view class="feedback__sec">
      <text class="feedback__sec-title">联系方式（可选）</text>
      <input
        v-model="form.contact"
        class="feedback__input"
        placeholder="手机号 / 微信号 / 邮箱，便于我们回访"
        maxlength="60"
      />
    </view>

    <view class="feedback__actions">
      <button class="feedback__btn" :loading="submitting" :disabled="!canSubmit" @tap="onSubmit">
        提交反馈
      </button>
    </view>

    <BizLoading v-if="uploading" fullscreen text="上传中..." />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/feedback.vue
   * @stage P5/T5.39 (Sprint 6)
   * @desc 意见反馈：分类 + 内容 + 截图 + 联系方式；调 submitFeedback
   * @author 单 Agent V2.0
   */
  import { ref, reactive, computed } from 'vue'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import { submitFeedback } from '@/api/user'
  import { uploadImages } from '@/api/file'
  import { logger } from '@/utils/logger'

  interface Category {
    label: string
    value: string
  }

  const categories: Category[] = [
    { label: '功能问题', value: 'function' },
    { label: '体验问题', value: 'ux' },
    { label: 'Bug 反馈', value: 'bug' },
    { label: '功能建议', value: 'suggestion' },
    { label: '其他', value: 'other' }
  ]

  const submitting = ref<boolean>(false)
  const uploading = ref<boolean>(false)

  const form = reactive<{
    category: string
    content: string
    contact: string
    imageUrls: string[]
  }>({
    category: 'function',
    content: '',
    contact: '',
    imageUrls: []
  })

  const canSubmit = computed<boolean>(() => {
    if (submitting.value) return false
    if (!form.category) return false
    if (form.content.trim().length < 5) return false
    return true
  })

  function onChoose() {
    const remain = 3 - form.imageUrls.length
    if (remain <= 0) return
    uni.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        if (!res.tempFilePaths.length) return
        void doUpload(res.tempFilePaths)
      }
    })
  }

  async function doUpload(paths: string[]) {
    uploading.value = true
    try {
      const r = await uploadImages(paths, 'proof', true)
      form.imageUrls = [...form.imageUrls, ...r.map((x) => x.url)]
    } catch (e) {
      logger.warn('feedback.upload.fail', { e: String(e) })
      uni.showToast({ title: '上传失败', icon: 'none' })
    } finally {
      uploading.value = false
    }
  }

  function onDelImage(i: number) {
    form.imageUrls = form.imageUrls.filter((_, idx) => idx !== i)
  }

  async function onSubmit() {
    if (!canSubmit.value) return
    submitting.value = true
    try {
      await submitFeedback({
        category: form.category,
        content: form.content.trim(),
        contact: form.contact.trim() || undefined,
        imageUrls: form.imageUrls.length ? form.imageUrls : undefined
      })
      uni.showToast({ title: '提交成功，感谢反馈', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('feedback.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .feedback {
    padding: 16rpx 16rpx 64rpx;

    &__sec {
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__sec-title {
      display: block;
      margin-bottom: 16rpx;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__cats {
      display: flex;
      flex-wrap: wrap;
      gap: 16rpx;
    }

    &__cat {
      padding: 12rpx 32rpx;
      font-size: $font-size-sm;
      color: $color-text-regular;
      background: $color-bg-page;
      border-radius: $radius-md;

      &--active {
        color: $color-text-inverse;
        background: $color-primary;
      }
    }

    &__textarea {
      width: 100%;
      min-height: 240rpx;
      padding: 16rpx;
      font-size: $font-size-base;
      line-height: 1.6;
      color: $color-text-primary;
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__counter {
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

    &__image {
      position: relative;
      width: 160rpx;
      height: 160rpx;
    }

    &__image-img {
      width: 100%;
      height: 100%;
      border-radius: $radius-sm;
    }

    &__image-del {
      @include flex-center;

      position: absolute;
      top: -12rpx;
      right: -12rpx;
      width: 40rpx;
      height: 40rpx;
      font-size: 28rpx;
      line-height: 1;
      color: $color-text-inverse;
      background: rgba(0, 0, 0, 0.5);
      border-radius: $radius-circle;
    }

    &__image-add {
      @include flex-center;

      width: 160rpx;
      height: 160rpx;
      font-size: 64rpx;
      color: $color-text-placeholder;
      background: $color-bg-page;
      border: 1rpx dashed $color-border;
      border-radius: $radius-sm;
    }

    &__input {
      width: 100%;
      height: 64rpx;
      padding: 0 16rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__actions {
      padding: 32rpx 16rpx 0;
    }

    &__btn {
      width: 100%;
      height: 88rpx;
      font-size: $font-size-md;
      line-height: 88rpx;
      color: $color-text-inverse;
      background: $color-primary;
      border: none;
      border-radius: $radius-lg;

      &[disabled] {
        background: #ffc6a8;
      }
    }
  }
</style>
