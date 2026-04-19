<template>
  <view class="page page-ab">
    <view class="ab-card">
      <text class="ab-title">异常上报</text>
      <text class="ab-desc">订单：{{ orderNo }}</text>

      <view class="form-field">
        <text class="form-label">异常类型</text>
        <view class="ab-types">
          <view
            v-for="t in types"
            :key="t.code"
            class="ab-type"
            :class="{ 'ab-type--active': form.abnormalType === t.code }"
            @click="form.abnormalType = t.code"
          >
            {{ t.name }}
          </view>
        </view>
      </view>

      <view class="form-field">
        <text class="form-label">详细说明</text>
        <textarea
          v-model="form.remark"
          class="form-textarea"
          placeholder="请详细描述异常情况（200 字内）"
          maxlength="200"
        />
      </view>

      <view class="form-field">
        <text class="form-label">凭证图（最多 3 张）</text>
        <view class="upload-list">
          <view v-for="(img, idx) in form.evidenceUrls" :key="idx" class="upload-list__item">
            <image :src="img" class="upload-img" mode="aspectFill" />
            <text class="upload-list__remove" @click="removeImage(idx)">×</text>
          </view>
          <view v-if="form.evidenceUrls.length < 3" class="upload-list__add" @click="onUpload"
            >+</view
          >
        </view>
      </view>

      <BizBtn type="warning" block :disabled="submitting" @click="onSubmit">
        {{ submitting ? '提交中...' : '提交异常上报' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { reportAbnormal } from '@/api/order'
  import { chooseAndUpload } from '@/api/file'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 异常上报（T6.22）
   *
   * 异常类型：
   *   1 缺货 / 2 客户退订 / 3 设备故障 / 4 其他
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const orderNo = ref<string>('')
  const submitting = ref<boolean>(false)

  const types = [
    { code: 1 as const, name: '缺货' },
    { code: 2 as const, name: '客户退订' },
    { code: 3 as const, name: '设备故障' },
    { code: 4 as const, name: '其他' }
  ]

  const form = reactive({
    abnormalType: 1 as 1 | 2 | 3 | 4,
    remark: '',
    evidenceUrls: [] as string[]
  })

  onLoad((opt) => {
    const o = opt as { orderNo?: string } | undefined
    if (o?.orderNo) orderNo.value = o.orderNo
  })

  async function onUpload() {
    try {
      const remain = 3 - form.evidenceUrls.length
      if (remain <= 0) return
      const urls = await chooseAndUpload(remain, 'order_abnormal', false)
      form.evidenceUrls = [...form.evidenceUrls, ...urls]
    } catch (e) {
      logger.warn('ab.upload.fail', { e: String(e) })
    }
  }

  function removeImage(idx: number) {
    form.evidenceUrls.splice(idx, 1)
  }

  async function onSubmit() {
    if (!form.remark.trim()) {
      uni.showToast({ title: '请填写详细说明', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      if (mockEnabled()) {
        await delay({ id: 'ab-' + Date.now() })
      } else {
        await reportAbnormal(orderNo.value, {
          abnormalType: form.abnormalType,
          remark: form.remark,
          evidenceUrls: form.evidenceUrls
        })
      }
      track(TRACK.REPORT_ABNORMAL, { orderNo: orderNo.value, abnormalType: form.abnormalType })
      uni.showToast({ title: '已上报', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('ab.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-ab {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .ab-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .ab-title {
    display: block;
    font-size: 30rpx;
    font-weight: 600;
  }

  .ab-desc {
    display: block;
    margin-top: 4rpx;
    margin-bottom: 24rpx;
    font-size: 22rpx;
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

  .ab-types {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16rpx;
  }

  .ab-type {
    padding: 24rpx;
    font-size: 26rpx;
    color: $uni-text-color;
    text-align: center;
    background: $uni-bg-color-grey;
    border: 2rpx solid transparent;
    border-radius: 12rpx;

    &--active {
      color: $uni-color-warning;
      background: rgb(250 140 22 / 12%);
      border-color: $uni-color-warning;
    }
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
