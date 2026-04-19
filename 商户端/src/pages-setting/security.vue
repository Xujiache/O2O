<template>
  <view class="page page-sec">
    <view class="sec-card">
      <text class="sec-title">账号安全</text>

      <view class="sec-row" @click="goChangePassword">
        <text class="sec-row__label">修改登录密码</text>
        <text class="sec-row__arrow">›</text>
      </view>
      <view class="sec-row" @click="goChangeMobile">
        <view>
          <text class="sec-row__label">修改绑定手机号</text>
          <text class="sec-row__sub">{{ maskMobile(authStore.profile?.mobile) }}</text>
        </view>
        <text class="sec-row__arrow">›</text>
      </view>
      <view class="sec-row">
        <view>
          <text class="sec-row__label">实名认证</text>
          <text class="sec-row__sub">{{ authStore.profile?.fullName }}</text>
        </view>
        <text class="sec-row__status sec-row__status--ok">已认证</text>
      </view>
    </view>

    <!-- 改密弹层 -->
    <BizDialog
      v-model:show="changePasswordVisible"
      title="修改密码"
      confirm-text="确认修改"
      @confirm="onSubmitChangePassword"
    >
      <view class="form-field">
        <input
          v-model="pwdForm.oldPassword"
          :password="true"
          class="form-input"
          placeholder="原密码"
          maxlength="20"
        />
      </view>
      <view class="form-field">
        <input
          v-model="pwdForm.newPassword"
          :password="true"
          class="form-input"
          placeholder="新密码（6-20 位）"
          maxlength="20"
        />
      </view>
      <view class="form-field">
        <input
          v-model="pwdForm.confirm"
          :password="true"
          class="form-input"
          placeholder="再次输入新密码"
          maxlength="20"
        />
      </view>
    </BizDialog>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { useAuthStore } from '@/store'
  import { changePassword } from '@/api/user'
  import { mockEnabled, delay } from '@/api/_mock'
  import { maskMobile } from '@/utils/format'
  import { logger } from '@/utils/logger'

  /**
   * 账号安全（T6.38）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const authStore = useAuthStore()

  const changePasswordVisible = ref<boolean>(false)
  const pwdForm = reactive({
    oldPassword: '',
    newPassword: '',
    confirm: ''
  })

  function goChangePassword() {
    pwdForm.oldPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirm = ''
    changePasswordVisible.value = true
  }

  function goChangeMobile() {
    uni.showToast({ title: '修改手机号需联系客服', icon: 'none' })
  }

  async function onSubmitChangePassword() {
    if (!pwdForm.oldPassword || pwdForm.newPassword.length < 6) {
      uni.showToast({ title: '请填写完整且密码 ≥ 6 位', icon: 'none' })
      return
    }
    if (pwdForm.newPassword !== pwdForm.confirm) {
      uni.showToast({ title: '两次密码不一致', icon: 'none' })
      return
    }
    try {
      if (!mockEnabled())
        await changePassword({ oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword })
      else await delay({ ok: true })
      uni.showToast({ title: '修改成功', icon: 'success' })
    } catch (e) {
      logger.warn('sec.changePwd.fail', { e: String(e) })
    }
  }
</script>

<style lang="scss" scoped>
  .page-sec {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .sec-card {
    background: #fff;
    border-radius: 16rpx;
  }

  .sec-title {
    display: block;
    padding: 24rpx;
    font-size: 28rpx;
    font-weight: 600;
    border-bottom: 1rpx solid $uni-border-color;
  }

  .sec-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }

    &__label {
      font-size: 28rpx;
      color: $uni-text-color;
    }

    &__sub {
      display: block;
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__arrow {
      font-size: 32rpx;
      color: $uni-text-color-placeholder;
    }

    &__status {
      padding: 4rpx 12rpx;
      font-size: 22rpx;
      border-radius: 999rpx;

      &--ok {
        color: $uni-color-success;
        background: rgb(82 196 26 / 12%);
      }
    }
  }

  .form-field {
    margin-bottom: 16rpx;
  }

  .form-input {
    width: 100%;
    height: 72rpx;
    padding: 0 24rpx;
    font-size: 26rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }
</style>
