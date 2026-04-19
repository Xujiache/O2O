<template>
  <view class="page page-white login">
    <view class="login__hero">
      <image
        class="login__logo"
        src="https://cdn.uviewui.com/uview/common/logo.png"
        mode="aspectFit"
      />
      <text class="login__title">O2O 同城生活</text>
      <text class="login__subtitle">外卖点餐 · 同城跑腿 · 一站式服务</text>
    </view>

    <view class="login__actions">
      <button
        class="login__btn login__btn--primary"
        open-type="getPhoneNumber"
        :loading="loading"
        :disabled="!agreed"
        @getphonenumber="onGetPhoneNumber"
      >
        微信一键登录
      </button>
      <view class="login__btn login__btn--ghost" @tap="onMobileLogin">
        <text>使用其他手机号</text>
      </view>
    </view>

    <view class="login__agreement">
      <view class="login__check" :class="{ 'login__check--on': agreed }" @tap="agreed = !agreed">
        <text v-if="agreed" class="login__check-mark">✓</text>
      </view>
      <text class="login__agreement-text">
        我已阅读并同意
        <text class="login__link" @tap.stop="onAgree('user')">《用户服务协议》</text>
        与
        <text class="login__link" @tap.stop="onAgree('privacy')">《隐私政策》</text>
      </text>
    </view>

    <BizLoading v-if="loading" fullscreen text="登录中..." />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/login/index.vue
   * @stage P5/T5.8 (Sprint 1)
   * @desc 登录页：微信一键登录（getPhoneNumber + login）；调后端 /auth/wx-mp/login + /auth/mobile/bind
   * @author 单 Agent V2.0
   */
  import { ref } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import { useUserStore } from '@/store/user'
  import { wxMpLogin, bindMobile } from '@/api/auth'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  const loading = ref<boolean>(false)
  const agreed = ref<boolean>(false)
  const redirect = ref<string>('')

  onLoad((options) => {
    track(TRACK.VIEW_LOGIN)
    if (options?.redirect) {
      redirect.value = decodeURIComponent(options.redirect)
    }
  })

  /**
   * 跳转回登录前页面（默认首页）
   */
  function goBackOrHome() {
    if (redirect.value) {
      uni.reLaunch({ url: redirect.value })
    } else {
      uni.switchTab({ url: '/pages/index/index' })
    }
  }

  /**
   * 微信一键登录（含 getPhoneNumber）
   */
  function onGetPhoneNumber(e: {
    detail: { errMsg: string; code?: string; encryptedData?: string; iv?: string }
  }) {
    if (!agreed.value) {
      uni.showToast({ title: '请先勾选用户协议', icon: 'none' })
      return
    }
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      uni.showToast({ title: '需授权手机号才能登录', icon: 'none' })
      return
    }
    track(TRACK.CLICK_LOGIN, { method: 'wx' })
    loading.value = true
    uni.login({
      provider: 'weixin',
      success: async (loginRes) => {
        try {
          const result = await wxMpLogin({
            code: loginRes.code,
            encryptedData: e.detail.encryptedData,
            iv: e.detail.iv
          })
          const user = useUserStore()
          user.setLogin(result)
          track(TRACK.LOGIN_SUCCESS, { uid: result.user.id })
          uni.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(goBackOrHome, 600)
        } catch (err) {
          track(TRACK.LOGIN_FAIL, { reason: String(err) })
          logger.warn('login.wxMp.fail', { err: String(err) })
        } finally {
          loading.value = false
        }
      },
      fail: () => {
        loading.value = false
        uni.showToast({ title: '微信登录失败', icon: 'none' })
      }
    })
  }

  /** 跳手机号登录页 */
  function onMobileLogin() {
    if (!agreed.value) {
      uni.showToast({ title: '请先勾选用户协议', icon: 'none' })
      return
    }
    uni.navigateTo({
      url:
        '/pages/login/bind-mobile' +
        (redirect.value ? `?redirect=${encodeURIComponent(redirect.value)}` : '')
    })
  }

  function onAgree(type: 'user' | 'privacy') {
    uni.showToast({
      title: type === 'user' ? '用户协议（占位）' : '隐私政策（占位）',
      icon: 'none'
    })
  }

  /** 给后端调用占位（防止 TS 报未使用） */
  void bindMobile
</script>

<style lang="scss" scoped>
  .login {
    padding: 96rpx 48rpx 48rpx;
    background: $color-bg-white;

    &__hero {
      @include flex-center;

      flex-direction: column;
      margin-top: 64rpx;
    }

    &__logo {
      width: 160rpx;
      height: 160rpx;
      border-radius: $radius-circle;
    }

    &__title {
      margin-top: 32rpx;
      font-size: 48rpx;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__subtitle {
      margin-top: 12rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__actions {
      margin-top: 96rpx;
    }

    &__btn {
      @include flex-center;

      width: 100%;
      height: 88rpx;
      margin-bottom: 24rpx;
      font-size: $font-size-md;
      border: none;
      border-radius: $radius-lg;

      &--primary {
        color: $color-text-inverse;
        background: $color-primary;
      }

      &--primary[disabled],
      &--primary[disabled]:active {
        background: #ffc6a8;
      }

      &--ghost {
        color: $color-primary;
        background: rgba(255, 106, 26, 0.08);
      }
    }

    &__agreement {
      display: flex;
      gap: 12rpx;
      align-items: flex-start;
      padding: 24rpx 16rpx 0;
    }

    &__check {
      flex-shrink: 0;
      width: 32rpx;
      height: 32rpx;
      margin-top: 4rpx;
      border: 2rpx solid $color-text-placeholder;
      border-radius: $radius-circle;

      &--on {
        @include flex-center;

        background: $color-primary;
        border-color: $color-primary;
      }
    }

    &__check-mark {
      font-size: 22rpx;
      line-height: 1;
      color: $color-text-inverse;
    }

    &__agreement-text {
      flex: 1;
      font-size: $font-size-sm;
      line-height: 1.6;
      color: $color-text-secondary;
    }

    &__link {
      color: $color-primary;
    }
  }
</style>
