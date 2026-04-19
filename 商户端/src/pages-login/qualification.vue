<template>
  <view class="page page-qualification">
    <view class="q-card">
      <text class="q-title">资质补充</text>
      <text class="q-desc">您的入驻申请被驳回，请按要求补充资料</text>

      <view class="q-reason" v-if="rejectReason">
        <text class="q-reason__label">驳回原因：</text>
        <text class="q-reason__text">{{ rejectReason }}</text>
      </view>

      <view class="form-field">
        <text class="form-label">营业执照</text>
        <view class="upload-card" @click="() => uploadFor('licenseUrl')">
          <image
            v-if="form.licenseUrl"
            class="upload-img"
            :src="form.licenseUrl"
            mode="aspectFill"
          />
          <view v-else class="upload-placeholder">
            <text>+</text>
            <text>点击上传</text>
          </view>
        </view>
      </view>

      <view class="form-field">
        <text class="form-label">食品经营许可证</text>
        <view class="upload-card" @click="() => uploadFor('foodLicenseUrl')">
          <image
            v-if="form.foodLicenseUrl"
            class="upload-img"
            :src="form.foodLicenseUrl"
            mode="aspectFill"
          />
          <view v-else class="upload-placeholder">
            <text>+</text>
            <text>点击上传</text>
          </view>
        </view>
      </view>

      <button class="form-submit" :disabled="submitting" @click="onSubmit">
        {{ submitting ? '提交中...' : '重新提交' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { chooseAndUpload } from '@/api/file'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'

  /**
   * 资质重新上传页（用于驳回后补料）
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.8)
   */
  const applyId = ref<string>('')
  const rejectReason = ref<string>('')
  const submitting = ref<boolean>(false)

  const form = reactive({
    licenseUrl: '',
    foodLicenseUrl: ''
  })

  onLoad((opt) => {
    const o = opt as { applyId?: string; reason?: string } | undefined
    if (o?.applyId) applyId.value = o.applyId
    if (o?.reason) rejectReason.value = decodeURIComponent(o.reason)
  })

  async function uploadFor(field: keyof typeof form) {
    try {
      const urls = await chooseAndUpload(1, 'merchant_qualification', false)
      if (urls.length > 0) {
        form[field] = urls[0]
      }
    } catch (e) {
      logger.warn('qualification.upload.fail', { field, e: String(e) })
    }
  }

  async function onSubmit() {
    if (!form.licenseUrl) {
      uni.showToast({ title: '请上传营业执照', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      if (mockEnabled()) await delay({ ok: true })
      /* 真实接口由 register 复用 reapplyMerchant */
      uni.showToast({ title: '已提交，等待审核', icon: 'success' })
      setTimeout(() => uni.reLaunch({ url: `/pages-login/audit-status?id=${applyId.value}` }), 1000)
    } catch (e) {
      logger.warn('qualification.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-qualification {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .q-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .q-title {
    display: block;
    font-size: 36rpx;
    font-weight: 600;
    color: $uni-text-color;
  }

  .q-desc {
    display: block;
    margin-top: 8rpx;
    margin-bottom: 24rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .q-reason {
    padding: 16rpx 24rpx;
    margin-bottom: 32rpx;
    font-size: 24rpx;
    color: $uni-color-error;
    background: rgb(255 77 79 / 8%);
    border-radius: $uni-border-radius-base;

    &__label {
      font-weight: 500;
    }
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

  .upload-card {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 320rpx;
    overflow: hidden;
    background: $uni-bg-color-grey;
    border: 2rpx dashed $uni-border-color;
    border-radius: $uni-border-radius-base;
  }

  .upload-img {
    width: 100%;
    height: 100%;
  }

  .upload-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .form-submit {
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
