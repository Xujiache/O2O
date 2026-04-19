<template>
  <view class="page page-sms">
    <view class="sms-card">
      <text class="sms-title">短信验证码登录</text>
      <text class="sms-desc">仅商户主账号可用此方式</text>

      <view class="form-field">
        <input
          v-model="form.mobile"
          class="form-input"
          type="number"
          placeholder="11 位注册手机号"
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

      <button class="form-submit" :disabled="submitting" @click="onLogin">
        {{ submitting ? '登录中...' : '登录' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { loginBySms, sendSmsCode } from '@/api/auth'
  import { useAuthStore } from '@/store'
  import { registerJPush } from '@/utils/jpush'
  import { mockEnabled, mockLoginResult, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 短信验证码登录（独立页面，与首页 tab 切换冗余支持）
   * @author 单 Agent V2.0 (P6 商户端 / T6.7)
   */
  const authStore = useAuthStore()
  const submitting = ref<boolean>(false)
  const smsCountdown = ref<number>(0)
  let smsTimer: ReturnType<typeof setInterval> | null = null

  const form = reactive({
    mobile: '',
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
    if (!/^1\d{10}$/.test(form.mobile)) {
      uni.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    try {
      if (mockEnabled()) {
        await delay({ ok: true })
      } else {
        await sendSmsCode({ mobile: form.mobile, scene: 'login' })
      }
      uni.showToast({ title: '验证码已发送', icon: 'success' })
      startCountdown()
    } catch (e) {
      logger.warn('sms-login.sms.fail', { e: String(e) })
    }
  }

  async function onLogin() {
    if (!/^1\d{10}$/.test(form.mobile)) {
      uni.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    if (!/^\d{6}$/.test(form.smsCode)) {
      uni.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      const result = mockEnabled()
        ? await delay(mockLoginResult)
        : await loginBySms({ mobile: form.mobile, smsCode: form.smsCode })
      authStore.setLogin(result)
      track(TRACK.LOGIN_SUCCESS, { mode: 'sms' })
      try {
        await registerJPush()
      } catch (e) {
        logger.warn('sms-login.jpush.fail', { e: String(e) })
      }
      if (result.user.status === 0 || result.user.status === 2) {
        uni.reLaunch({ url: `/pages-login/audit-status?id=${result.user.id}` })
      } else {
        uni.reLaunch({ url: '/pages/home/workbench' })
      }
    } catch (e) {
      logger.warn('sms-login.fail', { e: String(e) })
      track(TRACK.LOGIN_FAIL, { mode: 'sms' })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-sms {
    min-height: 100vh;
    padding: 80rpx 32rpx;
    background: $uni-bg-color-grey;
  }

  .sms-card {
    padding: 48rpx 40rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .sms-title {
    display: block;
    font-size: 36rpx;
    font-weight: 600;
    color: $uni-text-color;
  }

  .sms-desc {
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
