<template>
  <view class="page page-bce">
    <view class="bce-card">
      <text class="bce-title">添加银行卡</text>

      <view class="form-field">
        <text class="form-label">持卡人姓名</text>
        <input
          v-model="form.holderName"
          class="form-input"
          placeholder="请输入持卡人姓名"
          maxlength="20"
        />
      </view>
      <view class="form-field">
        <text class="form-label">卡号</text>
        <input
          v-model="form.cardNo"
          class="form-input"
          type="number"
          placeholder="请输入完整卡号"
          maxlength="20"
        />
      </view>
      <view class="form-field">
        <text class="form-label">开户行</text>
        <input
          v-model="form.bankName"
          class="form-input"
          placeholder="如：中国工商银行"
          maxlength="30"
        />
      </view>
      <view class="form-field">
        <text class="form-label">卡类型</text>
        <view class="bce-types">
          <text
            class="bce-type"
            :class="{ 'bce-type--active': form.cardType === 1 }"
            @click="form.cardType = 1"
            >借记卡</text
          >
          <text
            class="bce-type"
            :class="{ 'bce-type--active': form.cardType === 2 }"
            @click="form.cardType = 2"
            >信用卡</text
          >
        </view>
      </view>
      <view class="form-field">
        <view class="form-row">
          <input
            v-model="form.smsCode"
            class="form-input form-input--flex"
            type="number"
            placeholder="6 位验证码"
            maxlength="6"
          />
          <button class="bce-sms" :disabled="smsCountdown > 0" @click="onSendSms">
            {{ smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码' }}
          </button>
        </view>
      </view>

      <BizBtn type="primary" block :disabled="submitting" @click="onSubmit">
        {{ submitting ? '提交中...' : '保存' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { addBankCard } from '@/api/wallet'
  import { sendSmsCode } from '@/api/auth'
  import { mockEnabled, delay } from '@/api/_mock'
  import { useAuthStore } from '@/store'
  import { logger } from '@/utils/logger'

  /**
   * 添加银行卡（T6.31）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const authStore = useAuthStore()
  const submitting = ref<boolean>(false)
  const smsCountdown = ref<number>(0)
  let smsTimer: ReturnType<typeof setInterval> | null = null

  const form = reactive({
    holderName: authStore.profile?.contactName ?? '',
    cardNo: '',
    bankName: '',
    cardType: 1 as 1 | 2,
    smsCode: ''
  })

  function startCountdown() {
    smsCountdown.value = 60
    smsTimer = setInterval(() => {
      smsCountdown.value -= 1
      if (smsCountdown.value <= 0 && smsTimer) {
        clearInterval(smsTimer)
        smsTimer = null
      }
    }, 1000)
  }

  async function onSendSms() {
    const mobile = authStore.profile?.mobile
    if (!mobile) return
    try {
      if (mockEnabled()) await delay({ ok: true })
      else await sendSmsCode({ mobile, scene: 'bind_bank' })
      uni.showToast({ title: '验证码已发送', icon: 'success' })
      startCountdown()
    } catch (e) {
      logger.warn('bce.sms.fail', { e: String(e) })
    }
  }

  async function onSubmit() {
    if (!form.holderName.trim()) {
      uni.showToast({ title: '请填写持卡人', icon: 'none' })
      return
    }
    if (!/^\d{16,19}$/.test(form.cardNo)) {
      uni.showToast({ title: '卡号格式不正确', icon: 'none' })
      return
    }
    if (!form.bankName.trim()) {
      uni.showToast({ title: '请填写开户行', icon: 'none' })
      return
    }
    if (!/^\d{6}$/.test(form.smsCode)) {
      uni.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      if (mockEnabled()) await delay({})
      else
        await addBankCard({
          holderName: form.holderName,
          cardNo: form.cardNo,
          bankName: form.bankName,
          cardType: form.cardType,
          smsCode: form.smsCode
        })
      uni.showToast({ title: '已添加', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('bce.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-bce {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .bce-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .bce-title {
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

    &--flex {
      flex: 1;
      margin-right: 16rpx;
    }
  }

  .form-row {
    display: flex;
    align-items: center;
  }

  .bce-types {
    display: flex;
    gap: 16rpx;
  }

  .bce-type {
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

  .bce-sms {
    width: 200rpx;
    height: 80rpx;
    padding: 0;
    font-size: 24rpx;
    line-height: 80rpx;
    color: $uni-color-primary;
    background: #fff;
    border: 2rpx solid $uni-color-primary;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }

    &[disabled] {
      color: $uni-text-color-disable;
      border-color: $uni-text-color-disable;
    }
  }
</style>
