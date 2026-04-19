<template>
  <view class="page">
    <view class="hint"> 请如实填写申诉理由（7 天内可申诉），平台将在 1-3 个工作日内审核 </view>

    <view class="card">
      <view class="card__title">申诉理由</view>
      <textarea
        v-model="form.reason"
        class="textarea"
        placeholder="请详细说明申诉原因"
        maxlength="500"
      />
    </view>

    <view class="card">
      <view class="card__title">证据图片（可选，最多 6 张）</view>
      <view class="upload-row">
        <view v-for="(u, i) in form.evidenceUrls" :key="i" class="upload-cell">
          <image :src="u" mode="aspectFill" class="upload-img" />
          <text class="upload-remove" @click="onRemove(i)">×</text>
        </view>
        <view
          v-if="form.evidenceUrls.length < 6"
          class="upload-cell upload-cell--add"
          @click="onAdd"
        >
          + 添加
        </view>
      </view>
    </view>

    <button class="primary" :disabled="!canSubmit || submitting" @click="onSubmit">
      {{ submitting ? '提交中...' : '提交申诉' }}
    </button>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { submitAppeal } from '@/api/stat'
  import { chooseAndUploadImage } from '@/api/file'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 申诉提交（7 天内）
   *   T7.41
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const submitting = ref(false)
  const form = reactive({
    rewardId: '',
    reason: '',
    evidenceUrls: [] as string[]
  })

  const canSubmit = computed(() => form.rewardId && form.reason.trim().length >= 5)

  onLoad((q) => {
    const params = q as Record<string, string | undefined>
    form.rewardId = params.rewardId ?? ''
  })

  async function onAdd() {
    try {
      const r = await chooseAndUploadImage({ bizModule: 'rider-appeal', count: 1 })
      if (r.length > 0) form.evidenceUrls.push(r[0].url)
    } catch (e) {
      logger.warn('appeal.upload.fail', { e: String(e) })
    }
  }

  function onRemove(i: number) {
    form.evidenceUrls.splice(i, 1)
  }

  async function onSubmit() {
    if (!canSubmit.value) return
    submitting.value = true
    try {
      await submitAppeal(form)
      track(TRACK.APPEAL_SUBMIT, { rewardId: form.rewardId })
      uni.showToast({ title: '已提交，等待审核', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } catch (e) {
      logger.warn('appeal.submit.fail', { e: String(e) })
      uni.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .hint {
    padding: 16rpx;
    margin-bottom: 16rpx;
    font-size: 22rpx;
    color: $uni-color-warning;
    background: rgb(250 140 22 / 8%);
    border-radius: 12rpx;
  }

  .card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 16rpx;
      font-size: 26rpx;
      font-weight: 600;
    }
  }

  .textarea {
    width: 100%;
    min-height: 240rpx;
    padding: 16rpx;
    font-size: 26rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .upload-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .upload-cell {
    position: relative;
    width: 160rpx;
    height: 160rpx;
    overflow: hidden;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;

    &--add {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24rpx;
      color: $uni-text-color-grey;
      border: 2rpx dashed $uni-border-color;
    }
  }

  .upload-img {
    width: 100%;
    height: 100%;
  }

  .upload-remove {
    position: absolute;
    top: 4rpx;
    right: 4rpx;
    width: 36rpx;
    height: 36rpx;
    font-size: 24rpx;
    line-height: 36rpx;
    color: #fff;
    text-align: center;
    background: rgb(0 0 0 / 50%);
    border-radius: 50%;
  }

  .primary {
    width: 100%;
    height: 88rpx;
    margin-top: 16rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    color: #fff;
    background: $uni-color-primary;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }

    &[disabled] {
      opacity: 0.6;
    }
  }
</style>
