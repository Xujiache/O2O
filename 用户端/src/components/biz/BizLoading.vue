<template>
  <view v-if="visible" class="biz-loading" :class="{ 'biz-loading--full': fullscreen }">
    <view class="biz-loading__spinner" />
    <text v-if="text" class="biz-loading__text">{{ text }}</text>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file BizLoading.vue
   * @stage P5/T5.7 (Sprint 1)
   * @desc 通用 loading 组件：行内或全屏遮罩；CSS 动画
   * @author 单 Agent V2.0
   */
  import { withDefaults, defineProps } from 'vue'

  withDefaults(
    defineProps<{
      visible?: boolean
      text?: string
      fullscreen?: boolean
    }>(),
    {
      visible: true,
      text: '加载中...',
      fullscreen: false
    }
  )
</script>

<style lang="scss" scoped>
  .biz-loading {
    @include flex-center;

    flex-direction: column;
    padding: 48rpx;
    color: $color-text-secondary;

    &--full {
      position: fixed;
      inset: 0;
      z-index: $z-index-loading;
      background: rgba(255, 255, 255, 0.85);
    }

    &__spinner {
      width: 48rpx;
      height: 48rpx;
      border: 4rpx solid $color-divider;
      border-top-color: $color-primary;
      border-radius: $radius-circle;
      animation: spin 0.9s linear infinite;
    }

    &__text {
      margin-top: 16rpx;
      font-size: $font-size-sm;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
