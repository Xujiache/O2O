<template>
  <view class="page page-white bind">
    <view class="bind__title">绑定手机号</view>
    <view class="bind__subtitle">用于接收订单状态、配送通知</view>

    <view class="bind__form">
      <view class="bind__item">
        <text class="bind__label">手机号</text>
        <input
          v-model="mobile"
          class="bind__input"
          type="number"
          placeholder="请输入 11 位手机号"
          maxlength="11"
        />
      </view>
      <view class="bind__item">
        <text class="bind__label">验证码</text>
        <input
          v-model="smsCode"
          class="bind__input"
          type="number"
          placeholder="6 位短信验证码"
          maxlength="6"
        />
        <view
          class="bind__sms"
          :class="{ 'bind__sms--disabled': counter > 0 || !mobileValid }"
          @tap="onSendSms"
        >
          <text>{{ counter > 0 ? `${counter}s 后重发` : '获取验证码' }}</text>
        </view>
      </view>
    </view>

    <view class="bind__actions">
      <button class="bind__btn" :loading="submitting" :disabled="!canSubmit" @tap="onSubmit">
        确认绑定
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/login/bind-mobile.vue
   * @stage P5/T5.8 (Sprint 1)
   * @desc 手机号绑定：发送短信 + 提交校验；用于首次微信登录后或个人中心改绑
   * @author 单 Agent V2.0
   */
  import { ref, computed, onUnmounted } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { useUserStore } from '@/store/user'
  import { sendSmsCode, bindMobile } from '@/api/auth'
  import { logger } from '@/utils/logger'

  const mobile = ref<string>('')
  const smsCode = ref<string>('')
  const counter = ref<number>(0)
  const submitting = ref<boolean>(false)
  const redirect = ref<string>('')
  let timer: ReturnType<typeof setInterval> | null = null

  onLoad((options) => {
    if (options?.redirect) redirect.value = decodeURIComponent(options.redirect)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  const mobileValid = computed<boolean>(() => /^1\d{10}$/.test(mobile.value))
  const canSubmit = computed<boolean>(
    () => mobileValid.value && /^\d{6}$/.test(smsCode.value) && !submitting.value
  )

  async function onSendSms() {
    if (counter.value > 0 || !mobileValid.value) return
    try {
      await sendSmsCode({ mobile: mobile.value, scene: 'bind_mobile' })
      uni.showToast({ title: '验证码已发送', icon: 'success' })
      counter.value = 60
      timer = setInterval(() => {
        counter.value -= 1
        if (counter.value <= 0 && timer) {
          clearInterval(timer)
          timer = null
        }
      }, 1000)
    } catch (e) {
      logger.warn('bind.sms.fail', { e: String(e) })
    }
  }

  async function onSubmit() {
    if (!canSubmit.value) return
    submitting.value = true
    try {
      await bindMobile({ mobile: mobile.value, smsCode: smsCode.value })
      const user = useUserStore()
      if (user.profile) {
        user.setProfile({ ...user.profile, mobile: mobile.value })
      }
      uni.showToast({ title: '绑定成功', icon: 'success' })
      setTimeout(() => {
        if (redirect.value) {
          uni.reLaunch({ url: redirect.value })
        } else {
          uni.navigateBack()
        }
      }, 600)
    } catch (e) {
      logger.warn('bind.mobile.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .bind {
    padding: 64rpx 48rpx;
    background: $color-bg-white;

    &__title {
      font-size: 48rpx;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__subtitle {
      margin-top: 16rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__form {
      margin-top: 64rpx;
    }

    &__item {
      display: flex;
      align-items: center;
      padding: 24rpx 0;
      border-bottom: 1rpx solid $color-divider;
    }

    &__label {
      width: 140rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__input {
      flex: 1;
      height: 64rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__sms {
      padding: 12rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-md;

      &--disabled {
        color: $color-text-secondary;
        background: $color-divider;
      }
    }

    &__actions {
      margin-top: 64rpx;
    }

    &__btn {
      width: 100%;
      height: 88rpx;
      font-size: $font-size-md;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-lg;

      &[disabled] {
        background: #ffc6a8;
      }
    }
  }
</style>
