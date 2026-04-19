<template>
  <view class="page">
    <view class="card">
      <view class="card__title">异常类型</view>
      <view class="seg">
        <view
          v-for="t in types"
          :key="t.value"
          class="seg__item"
          :class="{ 'seg__item--active': form.abnormalType === t.value }"
          @click="form.abnormalType = t.value"
        >
          {{ t.label }}
        </view>
      </view>
    </view>

    <view class="card">
      <view class="card__title">详细描述</view>
      <textarea
        v-model="form.remark"
        class="textarea"
        placeholder="请详细描述异常情况，便于平台快速处理"
        maxlength="200"
      />
    </view>

    <view class="card">
      <view class="card__title">凭证图片（可选，最多 6 张）</view>
      <view class="upload-row">
        <view v-for="(u, i) in form.evidenceUrls" :key="i" class="upload-cell upload-cell--img">
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
      {{ submitting ? '提交中...' : '提交异常上报' }}
    </button>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { useOrderStore } from '@/store'
  import { chooseAndUploadImage } from '@/api/file'
  import type { RiderAbnormalReport } from '@/types/biz'
  import { logger } from '@/utils/logger'

  /**
   * 异常上报：6 类异常 + 描述 + 凭证（最多 6 张）
   * @author 单 Agent V2.0 (P7 骑手端 / T7.22)
   */
  const orderStore = useOrderStore()
  const submitting = ref(false)

  const types: { value: 1 | 2 | 3 | 4 | 5 | 6; label: string }[] = [
    { value: 1, label: '联系不上用户' },
    { value: 2, label: '取件失败' },
    { value: 3, label: '商家未出餐' },
    { value: 4, label: '物品损坏' },
    { value: 5, label: '地址错误' },
    { value: 6, label: '其他' }
  ]

  const form = reactive<RiderAbnormalReport>({
    orderNo: '',
    abnormalType: 1,
    remark: '',
    evidenceUrls: []
  })

  const canSubmit = computed(() => form.remark.trim().length > 0)

  onLoad((q) => {
    const params = q as Record<string, string | undefined>
    form.orderNo = params.orderNo ?? ''
  })

  async function onAdd() {
    try {
      const r = await chooseAndUploadImage({ bizModule: 'rider-emergency', count: 1 })
      if (r.length > 0) form.evidenceUrls.push(r[0].url)
    } catch (e) {
      logger.warn('abnormal.upload.fail', { e: String(e) })
    }
  }

  function onRemove(i: number) {
    form.evidenceUrls.splice(i, 1)
  }

  async function onSubmit() {
    if (!canSubmit.value) return
    submitting.value = true
    const ok = await orderStore.reportAbnormal(form)
    submitting.value = false
    if (ok) {
      uni.showToast({ title: '已提交，请等待平台处理', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    } else {
      uni.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx 24rpx 200rpx;
    background: $uni-bg-color-grey;
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

  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .seg__item {
    flex: 0 0 calc(50% - 6rpx);
    height: 64rpx;
    font-size: 24rpx;
    line-height: 64rpx;
    color: $uni-text-color-grey;
    text-align: center;
    background: $uni-bg-color-grey;
    border: 2rpx solid transparent;
    border-radius: $uni-border-radius-base;

    &--active {
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-color: $uni-color-primary;
    }
  }

  .textarea {
    width: 100%;
    min-height: 200rpx;
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
