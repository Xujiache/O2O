<template>
  <view class="page page-reset">
    <view class="reset-card">
      <text class="reset-title">重置密码</text>
      <text class="reset-desc">请填写注册手机号，验证后重置</text>

      <view class="form-field">
        <input
          v-model="form.mobile"
          class="form-input"
          type="number"
          placeholder="11 位手机号"
          maxlength="11"
        />
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
          <button class="form-sms-btn" :disabled="smsCountdown > 0" @click="onSendSms">
            {{ smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码' }}
          </button>
        </view>
      </view>
      <view class="form-field">
        <input
          v-model="form.newPassword"
          class="form-input"
          :password="true"
          placeholder="新密码（6-20 位）"
          maxlength="20"
        />
      </view>
      <view class="form-field">
        <input
          v-model="form.confirm"
          class="form-input"
          :password="true"
          placeholder="再次输入新密码"
          maxlength="20"
        />
      </view>

      <button class="form-submit" :disabled="submitting" @click="onSubmit">
        {{ submitting ? '提交中...' : '重置密码' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { resetPassword, sendSmsCode } from '@/api/auth'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'

  /**
   * 重置密码页
   *
   * 流程：
   *   1) 填手机号 → 发送验证码
   *   2) 填新密码（确认）
   *   3) 提交 → 跳回登录页
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.7)
   */

  const submitting = ref<boolean>(false)
  const smsCountdown = ref<number>(0)
  let smsTimer: ReturnType<typeof setInterval> | null = null

  const form = reactive({
    mobile: '',
    smsCode: '',
    newPassword: '',
    confirm: ''
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
    if (!/^1\d{10}$/.test(form.mobile)) {
      uni.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    try {
      if (mockEnabled()) {
        await delay({ ok: true })
      } else {
        await sendSmsCode({ mobile: form.mobile, scene: 'change_password' })
      }
      uni.showToast({ title: '验证码已发送', icon: 'success' })
      startCountdown()
    } catch (e) {
      logger.warn('reset.sms.fail', { e: String(e) })
    }
  }

  async function onSubmit() {
    if (!/^1\d{10}$/.test(form.mobile)) {
      uni.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    if (!/^\d{6}$/.test(form.smsCode)) {
      uni.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    if (form.newPassword.length < 6 || form.newPassword.length > 20) {
      uni.showToast({ title: '密码须为 6-20 位', icon: 'none' })
      return
    }
    if (form.newPassword !== form.confirm) {
      uni.showToast({ title: '两次密码不一致', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      if (mockEnabled()) {
        await delay({ ok: true })
      } else {
        await resetPassword({
          mobile: form.mobile,
          smsCode: form.smsCode,
          newPassword: form.newPassword
        })
      }
      uni.showToast({ title: '密码已重置，请重新登录', icon: 'success' })
      setTimeout(() => uni.reLaunch({ url: '/pages/login/index' }), 1200)
    } catch (e) {
      logger.warn('reset.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-reset {
    min-height: 100vh;
    padding: 80rpx 32rpx;
    background: $uni-bg-color-grey;
  }

  .reset-card {
    padding: 48rpx 40rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .reset-title {
    display: block;
    font-size: 36rpx;
    font-weight: 600;
    color: $uni-text-color;
  }

  .reset-desc {
    display: block;
    margin-top: 8rpx;
    margin-bottom: 32rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;
  }

  .form-field {
    margin-bottom: 24rpx;
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

  .form-sms-btn {
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

  .form-submit {
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
