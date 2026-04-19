<template>
  <view class="page">
    <view class="hero">
      <view class="hero__icon">🚴</view>
      <view class="hero__name">O2O 骑手端</view>
      <view class="hero__version">v{{ meta.version }}</view>
    </view>

    <view class="card">
      <view class="row" @click="onCopy(meta.contactPhone)">
        <text class="row__label">客服电话</text>
        <text class="row__value">{{ meta.contactPhone }}</text>
      </view>
      <view class="row" @click="onCopy(meta.email)">
        <text class="row__label">客服邮箱</text>
        <text class="row__value">{{ meta.email }}</text>
      </view>
      <view class="row" @click="goAgreement">
        <text class="row__label">骑手协议</text>
        <text class="row__arrow">›</text>
      </view>
      <view class="row" @click="goPrivacy">
        <text class="row__label">隐私政策</text>
        <text class="row__arrow">›</text>
      </view>
    </view>

    <view class="copyright">© 2026 O2O 平台 · All Rights Reserved</view>
  </view>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import { fetchAppMeta, type AppMeta } from '@/api/setting'

  /**
   * 关于：版本 + 联系方式 + 协议
   * @author 单 Agent V2.0 (P7 骑手端 / T7.44)
   */
  const meta = ref<AppMeta>({
    version: '0.1.0',
    privacyPolicyUrl: 'https://o2o.demo/privacy',
    userAgreementUrl: 'https://o2o.demo/agreement',
    riderAgreementUrl: 'https://o2o.demo/rider-agreement',
    contactPhone: '400-000-0000',
    email: 'support@o2o.demo'
  })

  onShow(async () => {
    try {
      meta.value = await fetchAppMeta()
    } catch {
      /* fallback */
    }
  })

  function onCopy(text: string) {
    uni.setClipboardData({
      data: text,
      success: () => uni.showToast({ title: '已复制', icon: 'success' })
    })
  }

  function goAgreement() {
    uni.navigateTo({ url: '/pages-login/agreement' })
  }

  function goPrivacy() {
    uni.navigateTo({ url: '/pages-login/agreement' })
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .hero {
    padding: 64rpx 0;
    text-align: center;

    &__icon {
      font-size: 96rpx;
    }

    &__name {
      margin: 16rpx 0 8rpx;
      font-size: 32rpx;
      font-weight: 600;
    }

    &__version {
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }
  }

  .card {
    background: #fff;
    border-radius: 16rpx;
  }

  .row {
    display: flex;
    align-items: center;
    padding: 24rpx;
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

  .copyright {
    margin-top: 64rpx;
    font-size: 22rpx;
    color: $uni-text-color-placeholder;
    text-align: center;
  }
</style>
