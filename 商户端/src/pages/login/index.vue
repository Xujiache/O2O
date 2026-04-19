<template>
  <view class="page page-login">
    <view class="login-header">
      <image class="login-logo" src="/static/logo.png" mode="aspectFit" />
      <text class="login-title">O2O 商户端</text>
      <text class="login-subtitle">商家工作台 · 接单 · 配送 · 结算</text>
    </view>

    <view class="login-card">
      <view class="login-tabs">
        <view
          class="login-tab"
          :class="{ 'login-tab--active': mode === 'password' }"
          @click="mode = 'password'"
        >
          账号密码
        </view>
        <view
          class="login-tab"
          :class="{ 'login-tab--active': mode === 'sms' }"
          @click="mode = 'sms'"
        >
          短信验证
        </view>
      </view>

      <view v-if="mode === 'password'" class="login-form">
        <view class="login-field">
          <text class="login-field__label">账号</text>
          <input
            v-model="form.account"
            class="login-field__input"
            type="text"
            placeholder="商户号 / 手机号 / 子账号"
            maxlength="32"
          />
        </view>
        <view class="login-field">
          <text class="login-field__label">密码</text>
          <input
            v-model="form.password"
            class="login-field__input"
            :password="true"
            placeholder="6-20 位密码"
            maxlength="20"
          />
        </view>
      </view>

      <view v-else class="login-form">
        <view class="login-field">
          <text class="login-field__label">手机号</text>
          <input
            v-model="form.mobile"
            class="login-field__input"
            type="number"
            placeholder="11 位手机号"
            maxlength="11"
          />
        </view>
        <view class="login-field">
          <text class="login-field__label">验证码</text>
          <view class="login-field__row">
            <input
              v-model="form.smsCode"
              class="login-field__input login-field__input--flex"
              type="number"
              placeholder="6 位验证码"
              maxlength="6"
            />
            <button class="login-sms-btn" :disabled="smsCountdown > 0" @click="onSendSms">
              {{ smsCountdown > 0 ? `${smsCountdown}s 后重发` : '获取验证码' }}
            </button>
          </view>
        </view>
      </view>

      <button class="login-submit" :disabled="submitting" @click="onLogin">
        {{ submitting ? '登录中...' : '登录' }}
      </button>

      <view class="login-actions">
        <text class="login-action" @click="goRegister">商户入驻</text>
        <text class="login-action" @click="goReset">忘记密码？</text>
      </view>

      <view class="login-agree">
        <checkbox
          :checked="agreed"
          color="#2F80ED"
          style="transform: scale(0.7)"
          @click="agreed = !agreed"
        />
        <text class="login-agree__text">
          已阅读并同意
          <text class="login-agree__link" @click.stop="goAgreement">《商户服务协议》</text>
        </text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { loginByPassword, loginBySms, sendSmsCode } from '@/api/auth'
  import { useAuthStore } from '@/store'
  import { mockEnabled, mockLoginResult, delay } from '@/api/_mock'
  import { registerJPush } from '@/utils/jpush'
  import { setSentryUser } from '@/utils/sentry'
  import { track, TRACK } from '@/utils/track'
  import { logger } from '@/utils/logger'

  /**
   * 登录入口（商户主账号 / 子账号）
   *
   * 模式：
   *   - password：账号 + 密码
   *   - sms：手机号 + 短信验证码（仅主账号）
   *
   * 流程：
   *   1) 表单校验
   *   2) 调 API 登录
   *   3) 写入 Pinia auth store + 持久化
   *   4) 注册极光推送 token
   *   5) 跳转工作台 / 审核状态页
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.7)
   */
  const authStore = useAuthStore()
  const mode = ref<'password' | 'sms'>('password')
  const submitting = ref<boolean>(false)
  const agreed = ref<boolean>(false)
  const smsCountdown = ref<number>(0)
  let smsTimer: ReturnType<typeof setInterval> | null = null

  const form = reactive({
    account: '',
    password: '',
    mobile: '',
    smsCode: ''
  })

  onLoad(() => {
    track(TRACK.VIEW_LOGIN)
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
      logger.warn('login.sms.fail', { e: String(e) })
    }
  }

  function validateForm(): boolean {
    if (!agreed.value) {
      uni.showToast({ title: '请先勾选商户服务协议', icon: 'none' })
      return false
    }
    if (mode.value === 'password') {
      if (!form.account.trim()) {
        uni.showToast({ title: '请输入账号', icon: 'none' })
        return false
      }
      if (!form.password || form.password.length < 6) {
        uni.showToast({ title: '密码至少 6 位', icon: 'none' })
        return false
      }
    } else {
      if (!/^1\d{10}$/.test(form.mobile)) {
        uni.showToast({ title: '手机号格式不正确', icon: 'none' })
        return false
      }
      if (!/^\d{6}$/.test(form.smsCode)) {
        uni.showToast({ title: '请输入 6 位验证码', icon: 'none' })
        return false
      }
    }
    return true
  }

  async function onLogin() {
    if (!validateForm()) return
    submitting.value = true
    try {
      const result = mockEnabled()
        ? await delay(mockLoginResult)
        : mode.value === 'password'
          ? await loginByPassword({ account: form.account, password: form.password })
          : await loginBySms({ mobile: form.mobile, smsCode: form.smsCode })

      authStore.setLogin(result)
      track(TRACK.LOGIN_SUCCESS, { mode: mode.value })

      /* 注册极光推送 token */
      try {
        await registerJPush()
      } catch (e) {
        logger.warn('login.jpush.fail', { e: String(e) })
      }

      /* Sentry 用户上下文 */
      setSentryUser({ id: result.user.id, mchntNo: result.user.mchntNo })

      uni.showToast({ title: '登录成功', icon: 'success' })

      /* 状态分流 */
      if (result.user.status === 0) {
        /* 待审核 */
        uni.reLaunch({ url: '/pages-login/audit-status?id=' + result.user.id })
      } else if (result.user.status === 2) {
        /* 驳回 → 重新提交 */
        uni.reLaunch({ url: '/pages-login/audit-status?id=' + result.user.id })
      } else {
        /* 通过 / 暂停（暂停时工作台会有提示） */
        uni.reLaunch({ url: '/pages/home/workbench' })
      }
    } catch (e) {
      logger.warn('login.fail', { e: String(e) })
      track(TRACK.LOGIN_FAIL, { mode: mode.value })
    } finally {
      submitting.value = false
    }
  }

  function goRegister() {
    uni.navigateTo({ url: '/pages-login/register' })
  }
  function goReset() {
    uni.navigateTo({ url: '/pages-login/reset-password' })
  }
  function goAgreement() {
    uni.navigateTo({ url: '/pages-login/agreement' })
  }
</script>

<style lang="scss" scoped>
  .page-login {
    min-height: 100vh;
    background: linear-gradient(180deg, #2f80ed 0%, #6db3ff 35%, #f5f7fa 80%);
  }

  .login-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 120rpx 0 40rpx;
    color: #fff;
  }

  .login-logo {
    width: 140rpx;
    height: 140rpx;
    margin-bottom: 24rpx;
  }

  .login-title {
    font-size: 44rpx;
    font-weight: 600;
  }

  .login-subtitle {
    margin-top: 12rpx;
    font-size: 24rpx;
    opacity: 0.85;
  }

  .login-card {
    width: 670rpx;
    padding: 48rpx 40rpx;
    margin: 0 auto;
    background: #fff;
    border-radius: 24rpx;
    box-shadow: 0 4rpx 20rpx rgb(47 128 237 / 12%);
  }

  .login-tabs {
    display: flex;
    margin-bottom: 32rpx;
    border-bottom: 2rpx solid $uni-border-color;
  }

  .login-tab {
    flex: 1;
    padding: 24rpx 0;
    font-size: 28rpx;
    color: $uni-text-color-grey;
    text-align: center;
    border-bottom: 4rpx solid transparent;

    &--active {
      font-weight: 600;
      color: $uni-color-primary;
      border-bottom-color: $uni-color-primary;
    }
  }

  .login-form {
    margin-bottom: 24rpx;
  }

  .login-field {
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
      color: $uni-text-color;
      background: $uni-bg-color-grey;
      border-radius: $uni-border-radius-base;

      &--flex {
        flex: 1;
        margin-right: 16rpx;
      }
    }

    &__row {
      display: flex;
      align-items: center;
    }
  }

  .login-sms-btn {
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

  .login-submit {
    width: 100%;
    height: 88rpx;
    margin: 16rpx 0 24rpx;
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

  .login-actions {
    display: flex;
    justify-content: space-between;
    margin-bottom: 24rpx;
  }

  .login-action {
    font-size: 24rpx;
    color: $uni-color-primary;
  }

  .login-agree {
    display: flex;
    align-items: center;
    font-size: 22rpx;
    color: $uni-text-color-grey;

    &__text {
      margin-left: 4rpx;
    }

    &__link {
      color: $uni-color-primary;
    }
  }
</style>
