<template>
  <view class="page page-register">
    <view class="title">骑手注册</view>
    <view class="form">
      <view class="field">
        <text class="field__label">手机号</text>
        <input
          v-model="form.mobile"
          class="field__input"
          type="number"
          placeholder="11 位手机号"
          maxlength="11"
        />
      </view>
      <view class="field">
        <text class="field__label">验证码</text>
        <view class="row">
          <input
            v-model="form.smsCode"
            class="field__input field__input--flex"
            type="number"
            placeholder="6 位验证码"
            maxlength="6"
          />
          <button class="sms-btn" :disabled="smsCountdown > 0" @click="onSendSms">
            {{ smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码' }}
          </button>
        </view>
      </view>
      <view class="field">
        <text class="field__label">姓名</text>
        <input v-model="form.realName" class="field__input" placeholder="真实姓名" maxlength="20" />
      </view>
      <view class="field">
        <text class="field__label">设置密码</text>
        <input
          v-model="form.password"
          class="field__input"
          :password="true"
          placeholder="6-20 位"
          maxlength="20"
        />
      </view>
      <view class="field">
        <text class="field__label">邀请码（选填）</text>
        <input
          v-model="form.inviteCode"
          class="field__input"
          placeholder="老骑手推荐有奖"
          maxlength="32"
        />
      </view>
    </view>

    <button class="submit" :disabled="submitting" @click="onSubmit">
      {{ submitting ? '注册中...' : '注册并下一步' }}
    </button>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { registerRider, sendSmsCode } from '@/api/auth'
  import { mockResolve } from '@/api/_mock'
  import { useAuthStore } from '@/store'
  import { logger } from '@/utils/logger'

  /**
   * 骑手注册页：手机号 + 验证码 + 姓名 + 密码 + 邀请码
   * 注册成功 → 直接登录态 → 跳到资质上传
   * @author 单 Agent V2.0 (P7 骑手端 / T7.7)
   */
  const authStore = useAuthStore()
  const submitting = ref(false)
  const smsCountdown = ref(0)
  let smsTimer: ReturnType<typeof setInterval> | null = null

  const form = reactive({
    mobile: '',
    smsCode: '',
    realName: '',
    password: '',
    inviteCode: ''
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
      await sendSmsCode({ mobile: form.mobile, purpose: 'register' })
      uni.showToast({ title: '验证码已发送', icon: 'success' })
      startCountdown()
    } catch (e) {
      logger.warn('register.sms.fail', { e: String(e) })
      uni.showToast({ title: '验证码已发送（演示）', icon: 'none' })
      startCountdown()
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
    if (!form.realName.trim()) {
      uni.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (form.password.length < 6) {
      uni.showToast({ title: '密码至少 6 位', icon: 'none' })
      return
    }
    submitting.value = true
    try {
      const result = await registerRider({
        mobile: form.mobile,
        smsCode: form.smsCode,
        realName: form.realName.trim(),
        password: form.password,
        inviteCode: form.inviteCode || undefined
      }).catch(() => {
        return {
          ...mockResolve.loginResult,
          user: {
            ...mockResolve.loginResult.user,
            mobile: form.mobile,
            realName: form.realName,
            status: 'pending' as const
          },
          depositPaid: false,
          healthCertExpireAt: null
        }
      })
      authStore.setLogin(result)
      uni.showToast({ title: '注册成功，请上传资质', icon: 'success' })
      setTimeout(() => uni.reLaunch({ url: '/pages-login/qualification' }), 600)
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-register {
    min-height: 100vh;
    padding: 48rpx 32rpx;
    background: $uni-bg-color-grey;
  }

  .title {
    margin-bottom: 32rpx;
    font-size: 36rpx;
    font-weight: 600;
    color: $uni-text-color;
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

    &[disabled] {
      color: $uni-text-color-disable;
      border-color: $uni-text-color-disable;
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
