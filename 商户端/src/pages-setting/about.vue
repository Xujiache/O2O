<template>
  <view class="page page-about">
    <view class="about-card">
      <view class="about-logo">O2O</view>
      <text class="about-name">O2O 商户端</text>
      <text class="about-version">版本 v{{ appStore.appVersion }}</text>
    </view>

    <view class="about-menu">
      <view class="about-row" @click="goAgreement">
        <text>商户服务协议</text>
        <text class="about-arrow">›</text>
      </view>
      <view class="about-row" @click="onCopyright">
        <text>版权信息</text>
        <text class="about-arrow">›</text>
      </view>
    </view>

    <text class="about-copy">© 2026 O2O 平台 版权所有</text>
  </view>
</template>

<script setup lang="ts">
  import { useAppStore } from '@/store'

  /**
   * 关于（T6.39）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const appStore = useAppStore()

  function goAgreement() {
    uni.navigateTo({ url: '/pages-login/agreement' })
  }

  function onCopyright() {
    uni.showModal({
      title: '版权信息',
      content: 'O2O 跑腿+外卖一体化平台\n商户端 v0.1.0\n\n© 2026 All Rights Reserved',
      showCancel: false
    })
  }
</script>

<style lang="scss" scoped>
  .page-about {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .about-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 64rpx 32rpx;
    margin-bottom: 24rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .about-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 160rpx;
    height: 160rpx;
    margin-bottom: 24rpx;
    font-size: 48rpx;
    font-weight: 700;
    color: #fff;
    background: $uni-color-primary;
    border-radius: 32rpx;
  }

  .about-name {
    font-size: 32rpx;
    font-weight: 600;
  }

  .about-version {
    margin-top: 8rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
  }

  .about-menu {
    background: #fff;
    border-radius: 16rpx;
  }

  .about-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx;
    font-size: 28rpx;
    border-bottom: 1rpx solid $uni-border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  .about-arrow {
    font-size: 32rpx;
    color: $uni-text-color-placeholder;
  }

  .about-copy {
    display: block;
    padding: 64rpx 0;
    font-size: 20rpx;
    color: $uni-text-color-placeholder;
    text-align: center;
  }
</style>
