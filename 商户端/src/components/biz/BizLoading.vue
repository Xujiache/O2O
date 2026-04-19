<template>
  <view v-if="show" class="biz-loading" :class="{ 'biz-loading--inline': !overlay }">
    <view class="biz-loading__spinner" />
    <text v-if="text" class="biz-loading__text">{{ text }}</text>
  </view>
</template>

<script setup lang="ts">
  /**
   * 加载状态组件
   *
   * 用法：
   *   <BizLoading :show="loading" text="加载中..." />
   *   <BizLoading :show="loading" overlay text="提交中" />
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  interface Props {
    show?: boolean
    text?: string
    /** 是否全屏遮罩 */
    overlay?: boolean
  }

  withDefaults(defineProps<Props>(), {
    show: true,
    text: '加载中...',
    overlay: false
  })
</script>

<style lang="scss" scoped>
  .biz-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40rpx 0;

    &--inline {
      padding: 24rpx 0;
    }

    &__spinner {
      width: 48rpx;
      height: 48rpx;
      margin-bottom: 16rpx;
      border: 4rpx solid #e8f1fd;
      border-top-color: $uni-color-primary;
      border-radius: 50%;
      animation: biz-loading-rotate 0.8s linear infinite;
    }

    &__text {
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }
  }

  @keyframes biz-loading-rotate {
    to {
      transform: rotate(360deg);
    }
  }
</style>
