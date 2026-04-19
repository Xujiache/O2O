<template>
  <view class="page page-ia">
    <view class="ia-card">
      <text class="ia-title">申请发票</text>

      <view class="form-field">
        <text class="form-label">关联订单号（多个用逗号分隔）</text>
        <textarea
          v-model="form.orderNosText"
          class="form-textarea"
          placeholder="如：TO20260418001,TO20260418002"
        />
      </view>

      <view class="form-field row-between">
        <text class="form-label">发票金额（元）</text>
        <input
          v-model="form.amount"
          class="form-input form-input--small"
          type="digit"
          placeholder="0.00"
        />
      </view>

      <view class="form-field">
        <text class="form-label">抬头类型</text>
        <view class="ia-types">
          <text
            class="ia-type"
            :class="{ 'ia-type--active': form.titleType === 1 }"
            @click="form.titleType = 1"
            >个人</text
          >
          <text
            class="ia-type"
            :class="{ 'ia-type--active': form.titleType === 2 }"
            @click="form.titleType = 2"
            >企业</text
          >
        </view>
      </view>

      <view class="form-field">
        <text class="form-label">发票抬头</text>
        <input v-model="form.title" class="form-input" placeholder="发票抬头" maxlength="50" />
      </view>

      <view v-if="form.titleType === 2" class="form-field">
        <text class="form-label">税号</text>
        <input v-model="form.taxNo" class="form-input" placeholder="纳税人识别号" maxlength="20" />
      </view>

      <view class="form-field">
        <text class="form-label">接收邮箱</text>
        <input
          v-model="form.email"
          class="form-input"
          type="text"
          placeholder="发票将发送至此邮箱"
        />
      </view>

      <BizBtn type="primary" block :disabled="submitting" @click="onSubmit">
        {{ submitting ? '提交中...' : '提交申请' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { applyInvoice } from '@/api/invoice'
  import { mockEnabled, delay } from '@/api/_mock'
  import { compareAmount } from '@/utils/format'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 申请发票（T6.32）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const submitting = ref<boolean>(false)

  const form = reactive({
    orderNosText: '',
    amount: '',
    titleType: 1 as 1 | 2,
    title: '',
    taxNo: '',
    email: ''
  })

  async function onSubmit() {
    const orderNos = form.orderNosText
      .split(/[,，;\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (orderNos.length === 0) {
      uni.showToast({ title: '请填写订单号', icon: 'none' })
      return
    }
    if (compareAmount(form.amount, '0') <= 0) {
      uni.showToast({ title: '金额必须 > 0', icon: 'none' })
      return
    }
    if (!form.title.trim()) {
      uni.showToast({ title: '请填写抬头', icon: 'none' })
      return
    }
    if (form.titleType === 2 && !/^[A-Z0-9]{15,20}$/.test(form.taxNo)) {
      uni.showToast({ title: '税号格式不正确', icon: 'none' })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      uni.showToast({ title: '邮箱格式不正确', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      if (mockEnabled()) {
        await delay({})
      } else {
        await applyInvoice({
          orderNos,
          amount: form.amount,
          titleType: form.titleType,
          title: form.title,
          taxNo: form.titleType === 2 ? form.taxNo : undefined,
          email: form.email
        })
      }
      track(TRACK.APPLY_INVOICE, { count: orderNos.length, amount: form.amount })
      uni.showToast({ title: '已提交申请', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('ia.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-ia {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .ia-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .ia-title {
    display: block;
    margin-bottom: 24rpx;
    font-size: 30rpx;
    font-weight: 600;
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

  .form-input {
    width: 100%;
    height: 80rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;

    &--small {
      width: 280rpx;
    }
  }

  .form-textarea {
    width: 100%;
    min-height: 160rpx;
    padding: 16rpx 24rpx;
    font-size: 26rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .ia-types {
    display: flex;
    gap: 16rpx;
  }

  .ia-type {
    flex: 1;
    padding: 16rpx;
    font-size: 26rpx;
    color: $uni-text-color;
    text-align: center;
    background: $uni-bg-color-grey;
    border: 2rpx solid transparent;
    border-radius: 12rpx;

    &--active {
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-color: $uni-color-primary;
    }
  }
</style>
