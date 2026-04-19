<template>
  <view class="page page-profile">
    <!-- 用户卡片 -->
    <view class="profile-card">
      <view class="profile-avatar">
        <text>{{ avatarChar }}</text>
      </view>
      <view class="profile-info">
        <text class="profile-name">{{ authStore.profile?.contactName || '未登录' }}</text>
        <text class="profile-id">{{ authStore.profile?.mchntNo || '请先登录' }}</text>
      </view>
      <view class="profile-role" v-if="authStore.profile">
        {{ authStore.isMaster ? '主账号' : roleText }}
      </view>
    </view>

    <!-- 入口列表 -->
    <view class="profile-menu">
      <view class="profile-menu__item" @click="goSecurity">
        <text class="profile-menu__icon">🔒</text>
        <text class="profile-menu__text">账号安全</text>
        <text class="profile-menu__arrow">›</text>
      </view>
      <view class="profile-menu__item" @click="goNotify">
        <text class="profile-menu__icon">🔔</text>
        <text class="profile-menu__text">通知设置</text>
        <text class="profile-menu__arrow">›</text>
      </view>
      <view class="profile-menu__item" @click="goStaff">
        <text class="profile-menu__icon">👥</text>
        <text class="profile-menu__text">子账号管理</text>
        <text class="profile-menu__arrow">›</text>
      </view>
      <view class="profile-menu__item" @click="goAbout">
        <text class="profile-menu__icon">ℹ️</text>
        <text class="profile-menu__text">关于</text>
        <text class="profile-menu__arrow">›</text>
      </view>
    </view>

    <button class="profile-logout" v-if="authStore.isLogin" @click="onLogout">退出登录</button>
    <button class="profile-login" v-else @click="goLogin">立即登录</button>
  </view>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useAuthStore, useAppStore } from '@/store'
  import { logout as apiLogout } from '@/api/auth'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'

  /**
   * 我的页（tabBar）
   *
   * 本期（S1）：登录态展示 + 退出登录
   * S5 完成：账号安全 / 通知设置 / 子账号管理
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const authStore = useAuthStore()
  const appStore = useAppStore()

  const avatarChar = computed<string>(() => {
    const name = authStore.profile?.contactName ?? ''
    return name.charAt(0) || '商'
  })

  const roleText = computed<string>(() => {
    const role = authStore.profile?.staffRole
    if (role === 'manager') return '店长'
    if (role === 'cashier') return '收银'
    if (role === 'staff') return '店员'
    return ''
  })

  function goLogin() {
    uni.reLaunch({ url: '/pages/login/index' })
  }

  function goSecurity() {
    uni.showToast({ title: 'S5 上线', icon: 'none' })
  }
  function goNotify() {
    uni.showToast({ title: 'S5 上线', icon: 'none' })
  }
  function goStaff() {
    uni.showToast({ title: 'S5 上线', icon: 'none' })
  }
  function goAbout() {
    uni.showToast({ title: 'S5 上线', icon: 'none' })
  }

  async function onLogout() {
    uni.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          if (!mockEnabled()) await apiLogout()
          else await delay({ ok: true })
        } catch (e) {
          logger.warn('logout.api.fail', { e: String(e) })
        }
        appStore.cleanupAll()
        await authStore.logout()
        uni.reLaunch({ url: '/pages/login/index' })
      }
    })
  }
</script>

<style lang="scss" scoped>
  .page-profile {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .profile-card {
    display: flex;
    align-items: center;
    padding: 32rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .profile-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 96rpx;
    height: 96rpx;
    margin-right: 24rpx;
    font-size: 36rpx;
    color: #fff;
    background: $uni-color-primary;
    border-radius: 50%;
  }

  .profile-info {
    flex: 1;
  }

  .profile-name {
    display: block;
    font-size: 30rpx;
    font-weight: 600;
    color: $uni-text-color;
  }

  .profile-id {
    display: block;
    margin-top: 8rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .profile-role {
    padding: 4rpx 16rpx;
    font-size: 22rpx;
    color: $uni-color-primary;
    background: $uni-color-primary-light;
    border-radius: 999rpx;
  }

  .profile-menu {
    background: #fff;
    border-radius: 16rpx;

    &__item {
      display: flex;
      align-items: center;
      padding: 24rpx 32rpx;
      border-bottom: 1rpx solid $uni-border-color;

      &:last-child {
        border-bottom: none;
      }
    }

    &__icon {
      width: 48rpx;
      margin-right: 16rpx;
      font-size: 32rpx;
    }

    &__text {
      flex: 1;
      font-size: 28rpx;
      color: $uni-text-color;
    }

    &__arrow {
      font-size: 32rpx;
      color: $uni-text-color-placeholder;
    }
  }

  .profile-logout,
  .profile-login {
    width: 100%;
    height: 88rpx;
    margin-top: 32rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    color: #fff;
    background: $uni-color-error;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }

  .profile-login {
    background: $uni-color-primary;
  }
</style>
