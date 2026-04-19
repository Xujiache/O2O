<template>
  <view class="profile">
    <view class="card user">
      <view class="avatar">{{ avatarLabel }}</view>
      <view class="info">
        <view class="name">{{ user?.realName ?? '骑手' }}</view>
        <view class="meta">{{ user?.mobile ?? '' }} · Lv.{{ user?.level ?? 1 }}</view>
      </view>
    </view>

    <view class="card menu">
      <view class="menu__item" @click="goAttendance">
        <text class="menu__icon">🕒</text>
        <text class="menu__label">考勤记录</text>
        <text class="menu__arrow">›</text>
      </view>
      <view class="menu__item" @click="goStat">
        <text class="menu__icon">📊</text>
        <text class="menu__label">数据统计</text>
        <text class="menu__arrow">›</text>
      </view>
      <view class="menu__item" @click="goLevel">
        <text class="menu__icon">🎖️</text>
        <text class="menu__label">等级与积分</text>
        <text class="menu__arrow">›</text>
      </view>
      <view class="menu__item" @click="goReward">
        <text class="menu__icon">⚖️</text>
        <text class="menu__label">奖惩记录</text>
        <text class="menu__arrow">›</text>
      </view>
      <view class="menu__item" @click="goAccept">
        <text class="menu__icon">⚙️</text>
        <text class="menu__label">接单设置</text>
        <text class="menu__arrow">›</text>
      </view>
      <view class="menu__item" @click="goNotify">
        <text class="menu__icon">🔔</text>
        <text class="menu__label">通知设置</text>
        <text class="menu__arrow">›</text>
      </view>
      <view class="menu__item" @click="goSecurity">
        <text class="menu__icon">🔒</text>
        <text class="menu__label">账号安全</text>
        <text class="menu__arrow">›</text>
      </view>
      <view class="menu__item" @click="goHelp">
        <text class="menu__icon">❓</text>
        <text class="menu__label">帮助中心</text>
        <text class="menu__arrow">›</text>
      </view>
      <view class="menu__item" @click="goAbout">
        <text class="menu__icon">ℹ️</text>
        <text class="menu__label">关于</text>
        <text class="menu__arrow">›</text>
      </view>
    </view>

    <button class="logout" @click="onLogout">退出登录</button>
  </view>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useAuthStore } from '@/store'
  import { track, TRACK } from '@/utils/track'
  import { onLoad } from '@dcloudio/uni-app'

  /**
   * 我的：用户信息 + 菜单聚合 + 退出登录
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  const auth = useAuthStore()
  const user = computed(() => auth.user)
  const avatarLabel = computed(() => (user.value?.realName ?? '骑').slice(-1))

  onLoad(() => {
    track(TRACK.VIEW_PROFILE)
  })

  function goAttendance() {
    uni.navigateTo({ url: '/pages-attendance/history' })
  }
  function goStat() {
    uni.navigateTo({ url: '/pages-stat/index' })
  }
  function goLevel() {
    uni.navigateTo({ url: '/pages-stat/level' })
  }
  function goReward() {
    uni.navigateTo({ url: '/pages-stat/reward' })
  }
  function goAccept() {
    uni.navigateTo({ url: '/pages-setting/accept' })
  }
  function goNotify() {
    uni.navigateTo({ url: '/pages-setting/notify' })
  }
  function goSecurity() {
    uni.navigateTo({ url: '/pages-setting/security' })
  }
  function goHelp() {
    uni.navigateTo({ url: '/pages-setting/help' })
  }
  function goAbout() {
    uni.navigateTo({ url: '/pages-setting/about' })
  }

  function onLogout() {
    uni.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
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
  .profile {
    min-height: 100vh;
    padding: 32rpx;
    background: $uni-bg-color-grey;
  }

  .card {
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .user {
    display: flex;
    align-items: center;
    padding: 32rpx;
  }

  .avatar {
    width: 96rpx;
    height: 96rpx;
    margin-right: 24rpx;
    font-size: 40rpx;
    line-height: 96rpx;
    color: #fff;
    text-align: center;
    background: $uni-color-primary;
    border-radius: 50%;
  }

  .info .name {
    font-size: 32rpx;
    font-weight: 600;
  }

  .info .meta {
    margin-top: 8rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .menu__item {
    display: flex;
    align-items: center;
    padding: 28rpx 24rpx;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  .menu__icon {
    margin-right: 16rpx;
    font-size: 36rpx;
  }

  .menu__label {
    flex: 1;
    font-size: 26rpx;
  }

  .menu__arrow {
    font-size: 36rpx;
    color: $uni-text-color-placeholder;
  }

  .logout {
    width: 100%;
    height: 88rpx;
    margin-top: 16rpx;
    font-size: 30rpx;
    line-height: 88rpx;
    color: $uni-color-error;
    background: #fff;
    border: none;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }
</style>
