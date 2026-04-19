<template>
  <view class="page page-white about">
    <view class="about__hero">
      <image class="about__logo" :src="logoUrl" mode="aspectFit" />
      <text class="about__title">O2O 同城生活</text>
      <text class="about__version">v{{ app.appVersion }}</text>
    </view>

    <view class="about__intro card">
      <text class="about__intro-text">
        O2O 同城生活致力于为用户提供「外卖点餐 + 同城跑腿」一站式服务。
        我们持续优化骑手调度、商家管理与配送体验，让你的每一次下单都更省心。
      </text>
    </view>

    <view class="about__menu card">
      <view class="about__row" @tap="onAgreement('user')">
        <text class="about__row-label">用户协议</text>
        <text class="about__row-arrow">›</text>
      </view>
      <view class="about__row" @tap="onAgreement('privacy')">
        <text class="about__row-label">隐私政策</text>
        <text class="about__row-arrow">›</text>
      </view>
      <view class="about__row" @tap="onCheckUpdate">
        <text class="about__row-label">检查更新</text>
        <text class="about__row-arrow">›</text>
      </view>
    </view>

    <view class="about__copyright">
      <text>© 2026 O2O 同城生活 出品</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/about.vue
   * @stage P5/T5.40 (Sprint 6)
   * @desc 关于我们：LOGO + 版本号 + 简介 + 协议入口
   * @author 单 Agent V2.0
   */
  import { useAppStore } from '@/store/app'

  const logoUrl = 'https://cdn.uviewui.com/uview/common/logo.png'
  const app = useAppStore()

  function onAgreement(type: 'user' | 'privacy') {
    uni.showToast({
      title: type === 'user' ? '用户协议（占位，P9 接入）' : '隐私政策（占位，P9 接入）',
      icon: 'none'
    })
  }

  function onCheckUpdate() {
    uni.showToast({ title: '当前已是最新版本', icon: 'success' })
  }
</script>

<style lang="scss" scoped>
  .about {
    padding: 64rpx 32rpx;

    &__hero {
      @include flex-center;

      flex-direction: column;
      padding: 32rpx 0;
    }

    &__logo {
      width: 160rpx;
      height: 160rpx;
      border-radius: $radius-lg;
    }

    &__title {
      margin-top: 24rpx;
      font-size: $font-size-xl;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__version {
      margin-top: 8rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__intro {
      padding: 32rpx;
      margin-top: 48rpx;
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__intro-text {
      font-size: $font-size-base;
      line-height: 1.7;
      color: $color-text-regular;
    }

    &__menu {
      margin-top: 32rpx;
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__row {
      @include flex-between;

      padding: 28rpx 24rpx;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }
    }

    &__row-label {
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__row-arrow {
      font-size: $font-size-md;
      color: $color-text-placeholder;
    }

    &__copyright {
      padding: 96rpx 0 16rpx;
      font-size: $font-size-xs;
      color: $color-text-placeholder;
      text-align: center;
    }
  }
</style>
