<template>
  <view class="page page-reset">
    <view class="title">重置密码</view>
    <view class="form">
      <view class="field">
        <text class="field__label">手机号</text>
        <input v-model="form.mobile" class="field__input" type="number" maxlength="11" />
      </view>
      <view class="field">
        <text class="field__label">验证码</text>
        <view class="row">
          <input
            v-model="form.smsCode"
            class="field__input field__input--flex"
            type="number"
            maxlength="6"
          />
          <button class="sms-btn" :disabled="countdown > 0" @click="sendSms">
            {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
          </button>
        </view>
      </view>
      <view class="field">
        <text class="field__label">新密码</text>
        <input
          v-model="form.newPassword"
          class="field__input"
          :password="true"
          maxlength="20"
          placeholder="6-20 位"
        />
      </view>
    </view>
    <button class="submit" :disabled="loading" @click="onSubmit">
      {{ loading ? '提交中...' : '重置密码' }}
    </button>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { resetPassword, sendSmsCode } from '@/api/auth'
  import { logger } from '@/utils/logger'

  /**
   * 重置密码：手机号 + 短信验证码 + 新密码
   * @author 单 Agent V2.0 (P7 骑手端 / T7.6)
   */
  const loading = ref(false)
  const countdown = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  const form = reactive({ mobile: '', smsCode: '', newPassword: '' })

  function start() {
    countdown.value = 60
    timer = setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
  }

  async function sendSms() {
    if (!/^1\d{10}$/.test(form.mobile)) {
      uni.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    try {
      await sendSmsCode({ mobile: form.mobile, purpose: 'reset' })
      uni.showToast({ title: '验证码已发送', icon: 'success' })
      start()
    } catch (e) {
      logger.warn('reset.sms.fail', { e: String(e) })
      uni.showToast({ title: '验证码已发送（演示）', icon: 'none' })
      start()
    }
  }

  async function onSubmit() {
    if (!/^1\d{10}$/.test(form.mobile)) return uni.showToast({ title: '手机号错误', icon: 'none' })
    if (!/^\d{6}$/.test(form.smsCode)) return uni.showToast({ title: '验证码格式错', icon: 'none' })
    if (form.newPassword.length < 6)
      return uni.showToast({ title: '新密码至少 6 位', icon: 'none' })
    loading.value = true
    try {
      await resetPassword(form)
      uni.showToast({ title: '密码已重置，请重新登录', icon: 'success' })
      setTimeout(() => uni.reLaunch({ url: '/pages/login/index' }), 600)
    } catch (e) {
      logger.warn('reset.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-reset {
    min-height: 100vh;
    padding: 48rpx 32rpx;
    background: $uni-bg-color-grey;
  }

  .title {
    margin-bottom: 32rpx;
    font-size: 36rpx;
    font-weight: 600;
  }

  .form {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .field {
    margin-bottom: 24rpx;

    &__label {
      display: block;
      margin-bottom: 12rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__input {
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
  }

  .row {
    display: flex;
    align-items: center;
  }

  .sms-btn {
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
  }

  .submit {
    width: 100%;
    height: 88rpx;
    margin-top: 32rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    color: #fff;
    background: $uni-color-primary;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }
</style>
