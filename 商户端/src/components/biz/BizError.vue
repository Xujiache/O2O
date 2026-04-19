<template>
  <view class="biz-error">
    <view class="biz-error__icon">⚠️</view>
    <text class="biz-error__title">{{ title }}</text>
    <text v-if="desc" class="biz-error__desc">{{ desc }}</text>
    <button v-if="showRetry" class="biz-error__retry" @click="onRetry">{{ retryText }}</button>
  </view>
</template>

<script setup lang="ts">
  /**
   * 错误占位组件
   *
   * 用法：
   *   <BizError v-if="errMsg" :desc="errMsg" @retry="reload" />
   *
   * @author 单 Agent V2.0 (P6 商户端)
   */
  interface Props {
    title?: string
    desc?: string
    showRetry?: boolean
    retryText?: string
  }

  withDefaults(defineProps<Props>(), {
    title: '加载失败',
    desc: '',
    showRetry: true,
    retryText: '重新加载'
  })

  const emit = defineEmits<{ (e: 'retry'): void }>()

  function onRetry() {
    emit('retry')
  }
</script>

<style lang="scss" scoped>
  .biz-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80rpx 32rpx;

    &__icon {
      margin-bottom: 24rpx;
      font-size: 96rpx;
      line-height: 1;
    }

    &__title {
      margin-bottom: 8rpx;
      font-size: 28rpx;
      font-weight: 500;
      color: $uni-text-color;
    }

    &__desc {
      max-width: 480rpx;
      font-size: 24rpx;
      color: $uni-text-color-grey;
      text-align: center;
    }

    &__retry {
      min-width: 240rpx;
      height: 64rpx;
      padding: 0 32rpx;
      margin-top: 32rpx;
      font-size: 26rpx;
      line-height: 64rpx;
      color: #fff;
      background: $uni-color-primary;
      border-radius: $uni-border-radius-base;

      &::after {
        border: none;
      }
    }
  }
</style>
