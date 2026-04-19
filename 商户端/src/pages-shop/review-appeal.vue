<template>
  <view class="page page-ra">
    <view class="ra-card">
      <text class="ra-title">申诉评价</text>
      <text class="ra-desc">如评价违反平台规范，请详细说明并上传凭证</text>

      <view class="form-field">
        <text class="form-label">申诉理由</text>
        <textarea
          v-model="reason"
          class="form-textarea"
          placeholder="请详细说明（200 字内）"
          maxlength="200"
        />
      </view>

      <view class="form-field">
        <text class="form-label">凭证图（最多 3 张）</text>
        <view class="upload-list">
          <view v-for="(img, idx) in evidenceUrls" :key="idx" class="upload-list__item">
            <image :src="img" class="upload-img" mode="aspectFill" />
            <text class="upload-list__remove" @click="removeImage(idx)">×</text>
          </view>
          <view v-if="evidenceUrls.length < 3" class="upload-list__add" @click="onUpload">+</view>
        </view>
      </view>

      <BizBtn type="warning" block :disabled="submitting || !reason.trim()" @click="onSubmit">
        {{ submitting ? '提交中...' : '提交申诉' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { appealReview } from '@/api/shop'
  import { chooseAndUpload } from '@/api/file'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 申诉评价（T6.16）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const reviewId = ref<string>('')
  const reason = ref<string>('')
  const evidenceUrls = ref<string[]>([])
  const submitting = ref<boolean>(false)

  onLoad((opt) => {
    const id = (opt as Record<string, string> | undefined)?.id
    if (id) reviewId.value = id
  })

  async function onUpload() {
    try {
      const remain = 3 - evidenceUrls.value.length
      if (remain <= 0) return
      const urls = await chooseAndUpload(remain, 'review_evidence', false)
      evidenceUrls.value = [...evidenceUrls.value, ...urls]
    } catch (e) {
      logger.warn('ra.upload.fail', { e: String(e) })
    }
  }

  function removeImage(idx: number) {
    evidenceUrls.value.splice(idx, 1)
  }

  async function onSubmit() {
    if (!reason.value.trim()) return
    submitting.value = true
    try {
      if (mockEnabled()) {
        await delay({ ok: true })
      } else {
        await appealReview(reviewId.value, {
          reason: reason.value,
          evidenceUrls: evidenceUrls.value
        })
      }
      track(TRACK.APPEAL_REVIEW, { reviewId: reviewId.value })
      uni.showToast({ title: '申诉已提交', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('ra.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-ra {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .ra-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .ra-title {
    display: block;
    font-size: 30rpx;
    font-weight: 600;
  }

  .ra-desc {
    display: block;
    margin-top: 8rpx;
    margin-bottom: 24rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .form-field {
    margin-bottom: 24rpx;
  }

  .form-label {
    display: block;
    margin-bottom: 12rpx;
    font-size: 26rpx;
    color: $uni-text-color;
  }

  .form-textarea {
    width: 100%;
    min-height: 200rpx;
    padding: 16rpx 24rpx;
    font-size: 28rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .upload-list {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;

    &__item {
      position: relative;
      width: 180rpx;
      height: 180rpx;
      overflow: hidden;
      border-radius: $uni-border-radius-base;
    }

    &__remove {
      position: absolute;
      top: 4rpx;
      right: 4rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36rpx;
      height: 36rpx;
      font-size: 24rpx;
      color: #fff;
      background: rgb(0 0 0 / 60%);
      border-radius: 50%;
    }

    &__add {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 180rpx;
      height: 180rpx;
      font-size: 60rpx;
      color: $uni-text-color-grey;
      background: $uni-bg-color-grey;
      border: 2rpx dashed $uni-border-color;
      border-radius: $uni-border-radius-base;
    }
  }

  .upload-img {
    width: 100%;
    height: 100%;
  }
</style>
