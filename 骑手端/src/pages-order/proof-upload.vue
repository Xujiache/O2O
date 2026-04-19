<template>
  <view class="page">
    <view class="head">
      <view class="head__title">{{ kind === 'pickup' ? '取件凭证' : '送达凭证' }}</view>
      <view class="head__desc">拍摄凭证后将自动叠加 时间 + 订单号 + GPS 水印</view>
    </view>

    <view class="card">
      <view class="preview" @click="onTakePhoto">
        <image v-if="watermarkedUrl" :src="watermarkedUrl" mode="aspectFill" class="preview__img" />
        <view v-else class="preview__placeholder">
          <text class="preview__icon">📸</text>
          <text>点击拍摄凭证</text>
        </view>
      </view>
    </view>

    <button class="primary" :disabled="!watermarkedUrl || submitting" @click="onSubmit">
      {{ submitting ? '上传中...' : kind === 'pickup' ? '提交取件凭证' : '提交送达凭证' }}
    </button>

    <!-- 离屏 canvas（仅用于水印渲染） -->
    <canvas
      v-show="false"
      :canvas-id="canvasId"
      type="2d"
      :style="{ width: '1280px', height: '720px' }"
    />
  </view>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { useOrderStore, useLocationStore } from '@/store'
  import { drawWatermark } from '@/utils/watermark'
  import { uploadFile } from '@/api/file'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 凭证上传：拍照 → canvas 水印（订单号/时间/GPS）→ 上传 → POST proof
   *   T7.20 + T7.21
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const orderStore = useOrderStore()
  const location = useLocationStore()

  const orderNo = ref('')
  const kind = ref<'pickup' | 'deliver'>('deliver')
  const watermarkedUrl = ref('')
  const submitting = ref(false)
  const canvasId = 'proof-watermark-canvas'

  onLoad((q) => {
    const params = q as Record<string, string | undefined>
    orderNo.value = params.orderNo ?? ''
    kind.value = params.kind === 'pickup' ? 'pickup' : 'deliver'
  })

  async function onTakePhoto() {
    try {
      const res = await new Promise<UniApp.ChooseImageSuccessCallbackResult>((resolve, reject) => {
        uni.chooseImage({
          count: 1,
          sourceType: ['camera', 'album'],
          sizeType: ['compressed'],
          success: resolve,
          fail: (err) => reject(new Error(err.errMsg ?? '拍照取消'))
        })
      })
      const photoPath = res.tempFilePaths[0]
      const loc = (await location.pickOnce()) ?? { lat: 0, lng: 0 }
      uni.showLoading({ title: '生成水印中...', mask: true })
      const url = await drawWatermark({
        photoPath,
        orderNo: orderNo.value,
        lat: loc.lat,
        lng: loc.lng,
        canvasId
      })
      uni.hideLoading()
      watermarkedUrl.value = url
    } catch (e) {
      uni.hideLoading()
      logger.warn('proof.take.fail', { e: String(e) })
      uni.showToast({ title: '拍照失败，请重试', icon: 'none' })
    }
  }

  async function onSubmit() {
    if (!watermarkedUrl.value) return
    submitting.value = true
    try {
      uni.showLoading({ title: '上传中...', mask: true })
      const file = await uploadFile(
        watermarkedUrl.value,
        kind.value === 'pickup' ? 'rider-pickup-proof' : 'rider-deliver-proof'
      )
      uni.hideLoading()
      let ok: boolean
      if (kind.value === 'pickup') {
        ok = await orderStore.uploadPickupProof(orderNo.value, file.url)
      } else {
        ok = await orderStore.deliver(orderNo.value, file.url)
      }
      if (ok) {
        track(TRACK.PROOF_UPLOAD_SUCCESS, { orderNo: orderNo.value, kind: kind.value })
        uni.showToast({
          title: kind.value === 'pickup' ? '取件凭证已上传' : '送达成功',
          icon: 'success'
        })
        setTimeout(() => uni.navigateBack(), 600)
      } else {
        track(TRACK.PROOF_UPLOAD_FAIL, { orderNo: orderNo.value })
        uni.showToast({ title: '上传失败，请重试', icon: 'none' })
      }
    } catch (e) {
      uni.hideLoading()
      logger.warn('proof.submit.fail', { e: String(e) })
      uni.showToast({ title: '上传失败，请重试', icon: 'none' })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 32rpx;
    background: $uni-bg-color-grey;
  }

  .head {
    margin-bottom: 24rpx;
    text-align: center;

    &__title {
      margin-top: 16rpx;
      font-size: 32rpx;
      font-weight: 600;
    }

    &__desc {
      margin-top: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .card {
    padding: 24rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .preview {
    aspect-ratio: 4 / 3;
    overflow: hidden;
    background: $uni-bg-color-grey;
    border: 2rpx dashed $uni-border-color;
    border-radius: $uni-border-radius-base;

    &__img {
      width: 100%;
      height: 100%;
    }

    &__placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__icon {
      margin-bottom: 8rpx;
      font-size: 80rpx;
    }
  }

  .primary {
    width: 100%;
    height: 88rpx;
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
