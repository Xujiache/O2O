<template>
  <view class="page page-ra">
    <view class="ra-card">
      <text class="ra-title">退款审核</text>
      <text class="ra-desc">单号：{{ orderNo }}</text>

      <view class="ra-info">
        <view class="ra-info__row">
          <text class="ra-info__label">申请金额</text>
          <text class="ra-info__amount">{{ formatAmount(refundInfo.refundAmount) }}</text>
        </view>
        <view class="ra-info__row">
          <text class="ra-info__label">申请理由</text>
          <text>{{ refundInfo.reason }}</text>
        </view>
        <view v-if="refundInfo.evidenceUrls?.length" class="ra-info__row ra-info__row--col">
          <text class="ra-info__label">凭证图</text>
          <view class="ra-evidence">
            <image
              v-for="(url, idx) in refundInfo.evidenceUrls"
              :key="idx"
              :src="url"
              class="ra-evidence__img"
              mode="aspectFill"
              @click="previewImage(idx)"
            />
          </view>
        </view>
      </view>

      <view class="form-field">
        <text class="form-label">处理意见</text>
        <textarea
          v-model="merchantReply"
          class="form-textarea"
          placeholder="请填写您的处理意见（200 字内）"
          maxlength="200"
        />
      </view>

      <view class="ra-actions">
        <BizBtn type="default" text="拒绝退款" :disabled="submitting" @click="onReject" />
        <BizBtn type="primary" text="同意退款" :disabled="submitting" @click="onApprove" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { approveRefund, rejectRefund } from '@/api/order'
  import { mockEnabled, delay } from '@/api/_mock'
  import { formatAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 退款审核（T6.21）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const orderNo = ref<string>('')
  const refundId = ref<string>('')
  const merchantReply = ref<string>('')
  const submitting = ref<boolean>(false)

  const refundInfo = reactive({
    refundAmount: '0.00',
    reason: '',
    evidenceUrls: [] as string[]
  })

  onLoad((opt) => {
    const o = opt as { orderNo?: string; refundId?: string } | undefined
    if (o?.orderNo) orderNo.value = o.orderNo
    if (o?.refundId) refundId.value = o.refundId
    /* mock 数据 */
    Object.assign(refundInfo, {
      refundAmount: '15.00',
      reason: '商品质量不佳，菜品过咸',
      evidenceUrls: ['https://placehold.co/300x300']
    })
  })

  function previewImage(idx: number) {
    uni.previewImage({
      urls: refundInfo.evidenceUrls,
      current: idx
    })
  }

  async function onApprove() {
    submitting.value = true
    try {
      if (mockEnabled()) await delay({ ok: true })
      else
        await approveRefund(refundId.value || orderNo.value, { merchantReply: merchantReply.value })
      track(TRACK.REFUND_APPROVE, { orderNo: orderNo.value })
      uni.showToast({ title: '已同意退款', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('ra.approve.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }

  async function onReject() {
    if (!merchantReply.value.trim()) {
      uni.showToast({ title: '拒绝理由必填', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      if (mockEnabled()) await delay({ ok: true })
      else
        await rejectRefund(refundId.value || orderNo.value, { merchantReply: merchantReply.value })
      track(TRACK.REFUND_REJECT, { orderNo: orderNo.value })
      uni.showToast({ title: '已拒绝退款', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('ra.reject.fail', { e: String(e) })
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
    margin-top: 4rpx;
    margin-bottom: 24rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .ra-info {
    padding: 24rpx;
    margin-bottom: 24rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;

    &__row {
      display: flex;
      align-items: center;
      padding: 8rpx 0;
      font-size: 26rpx;

      &--col {
        flex-direction: column;
        align-items: flex-start;
      }
    }

    &__label {
      width: 140rpx;
      color: $uni-text-color-grey;
    }

    &__amount {
      font-weight: 600;
      color: $uni-color-error;
    }
  }

  .ra-evidence {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
    margin-top: 12rpx;

    &__img {
      width: 160rpx;
      height: 160rpx;
      border-radius: $uni-border-radius-base;
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

  .form-textarea {
    width: 100%;
    min-height: 200rpx;
    padding: 16rpx 24rpx;
    font-size: 28rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .ra-actions {
    display: flex;
    gap: 16rpx;
  }
</style>
