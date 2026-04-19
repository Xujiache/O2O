<template>
  <view class="page page-white cs">
    <view class="cs__hero">
      <text class="cs__hero-icon">💬</text>
      <text class="cs__hero-title">在线客服</text>
      <text class="cs__hero-sub">服务时间 9:00 - 22:00</text>
    </view>

    <button class="cs__main-btn" open-type="contact" @tap="onClickCs"> 联系客服 </button>

    <view class="cs__divider">其他联系方式</view>

    <view class="cs__list">
      <view class="cs__item" @tap="onCallCs">
        <text class="cs__item-icon">📞</text>
        <view class="cs__item-info">
          <text class="cs__item-name">客服电话</text>
          <text class="cs__item-desc">{{ HOTLINE }}</text>
        </view>
        <text class="cs__item-arrow">›</text>
      </view>
      <view class="cs__item" @tap="onGoFaq">
        <text class="cs__item-icon">❓</text>
        <view class="cs__item-info">
          <text class="cs__item-name">常见问题</text>
          <text class="cs__item-desc">查看高频问题与解决方案</text>
        </view>
        <text class="cs__item-arrow">›</text>
      </view>
      <view class="cs__item" @tap="onGoFeedback">
        <text class="cs__item-icon">✉️</text>
        <view class="cs__item-info">
          <text class="cs__item-name">意见反馈</text>
          <text class="cs__item-desc">告诉我们你的建议</text>
        </view>
        <text class="cs__item-arrow">›</text>
      </view>
    </view>

    <view class="cs__tip"> 工单 / IM 完整通道将在 P9 阶段上线，当前可使用微信客服会话窗口 </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/cs.vue
   * @stage P5/T5.39 (Sprint 6)
   * @desc 在线客服占位：button open-type="contact" 拉起微信客服会话；备 hotline / faq / feedback
   * @author 单 Agent V2.0
   */
  import { logger } from '@/utils/logger'

  const HOTLINE = '400-000-0000'

  function onClickCs() {
    logger.info('cs.click')
  }

  function onCallCs() {
    uni.makePhoneCall({
      phoneNumber: HOTLINE,
      fail: (err) => {
        logger.warn('cs.call.fail', { e: String(err.errMsg ?? '') })
      }
    })
  }

  function onGoFaq() {
    uni.navigateTo({ url: '/pages-user/faq' })
  }

  function onGoFeedback() {
    uni.navigateTo({ url: '/pages-user/feedback' })
  }
</script>

<style lang="scss" scoped>
  .cs {
    padding: 64rpx 32rpx;

    &__hero {
      @include flex-center;

      flex-direction: column;
      padding: 32rpx 0 48rpx;
    }

    &__hero-icon {
      font-size: 96rpx;
    }

    &__hero-title {
      margin-top: 16rpx;
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__hero-sub {
      margin-top: 8rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__main-btn {
      width: 100%;
      height: 96rpx;
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      line-height: 96rpx;
      color: $color-text-inverse;
      background: $color-primary;
      border: none;
      border-radius: $radius-lg;
    }

    &__divider {
      padding: 48rpx 0 16rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }

    &__list {
      background: $color-bg-page;
      border-radius: $radius-md;
    }

    &__item {
      @include flex-between;

      padding: 28rpx 24rpx;
      background: $color-bg-page;
      border-bottom: 1rpx solid $color-border-light;

      &:last-child {
        border-bottom: none;
      }
    }

    &__item-icon {
      flex-shrink: 0;
      font-size: $font-size-lg;
    }

    &__item-info {
      flex: 1;
      margin-left: 16rpx;
    }

    &__item-name {
      display: block;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__item-desc {
      display: block;
      margin-top: 4rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__item-arrow {
      flex-shrink: 0;
      font-size: $font-size-md;
      color: $color-text-placeholder;
    }

    &__tip {
      padding: 32rpx 16rpx;
      font-size: $font-size-xs;
      line-height: 1.6;
      color: $color-text-placeholder;
      text-align: center;
    }
  }
</style>
