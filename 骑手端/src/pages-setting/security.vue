<template>
  <view class="page">
    <view class="card">
      <view class="card__title">修改密码</view>
      <view class="field">
        <text class="field__label">原密码</text>
        <input v-model="form.oldPassword" class="field__input" :password="true" maxlength="20" />
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
      <button class="primary" :disabled="!canChange || loading" @click="onChange">
        {{ loading ? '提交中...' : '修改密码' }}
      </button>
    </view>

    <view class="card">
      <view class="card__title">账号操作</view>
      <view class="row" @click="goBindMobile">
        <text class="row__label">手机号</text>
        <text class="row__value">{{ user?.mobile ?? '未绑定' }}</text>
        <text class="row__arrow">›</text>
      </view>
      <view class="row danger" @click="onLogout">
        <text class="row__label danger">退出登录</text>
        <text class="row__arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed, reactive, ref } from 'vue'
  import { useAuthStore } from '@/store'
  import { changePassword } from '@/api/setting'
  import { logger } from '@/utils/logger'

  /**
   * 账号安全：改密 / 手机号 / 退出
   *   T7.44
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const auth = useAuthStore()
  const loading = ref(false)
  const form = reactive({ oldPassword: '', newPassword: '' })

  const user = computed(() => auth.user)
  const canChange = computed(() => form.oldPassword.length >= 6 && form.newPassword.length >= 6)

  async function onChange() {
    if (!canChange.value) return
    loading.value = true
    try {
      await changePassword(form)
      uni.showToast({ title: '密码已修改，请重新登录', icon: 'success' })
      setTimeout(async () => {
        await auth.logout()
        uni.reLaunch({ url: '/pages/login/index' })
      }, 800)
    } catch (e) {
      logger.warn('security.changePwd.fail', { e: String(e) })
      uni.showToast({ title: '修改失败，请重试', icon: 'none' })
    } finally {
      loading.value = false
    }
  }

  function goBindMobile() {
    uni.showToast({ title: '修改手机号需联系客服', icon: 'none' })
  }

  function onLogout() {
    uni.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？退出后将停止接单',
      success: ({ confirm }) => {
        if (!confirm) return
        void auth.logout().then(() => {
          uni.reLaunch({ url: '/pages/login/index' })
        })
      }
    })
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: #fff;
    border-radius: 16rpx;

    &__title {
      margin-bottom: 16rpx;
      font-size: 26rpx;
      font-weight: 600;
    }
  }

  .field {
    margin-bottom: 16rpx;

    &__label {
      display: block;
      margin-bottom: 8rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }

    &__input {
      width: 100%;
      height: 80rpx;
      padding: 0 24rpx;
      font-size: 28rpx;
      background: $uni-bg-color-grey;
      border-radius: $uni-border-radius-base;
    }
  }

  .row {
    display: flex;
    align-items: center;
    padding: 24rpx 0;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }

    &__label {
      flex: 1;
      font-size: 26rpx;
    }

    &__value {
      margin-right: 12rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }

    &__arrow {
      font-size: 32rpx;
      color: $uni-text-color-placeholder;
    }
  }

  .danger {
    color: $uni-color-error;
  }

  .primary {
    width: 100%;
    height: 80rpx;
    margin-top: 16rpx;
    font-size: 28rpx;
    line-height: 80rpx;
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
