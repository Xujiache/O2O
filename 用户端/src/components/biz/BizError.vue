<template>
  <view class="biz-error">
    <image
      class="biz-error__icon"
      src="https://cdn.uviewui.com/uview/empty/error.png"
      mode="aspectFit"
    />
    <text class="biz-error__title">{{ title }}</text>
    <text v-if="desc" class="biz-error__desc">{{ desc }}</text>
    <view class="biz-error__actions">
      <view class="biz-error__btn" @tap="onRetry">
        <text>重试</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file BizError.vue
   * @stage P5/T5.7 (Sprint 1)
   * @desc 通用错误态组件：标题 + 描述 + 重试按钮
   * @author 单 Agent V2.0
   */
  import { withDefaults, defineProps, defineEmits } from 'vue'

  withDefaults(
    defineProps<{
      title?: string
      desc?: string
    }>(),
    {
      title: '加载失败',
      desc: ''
    }
  )

  const emit = defineEmits<{ (e: 'retry'): void }>()

  function onRetry() {
    emit('retry')
  }
</script>

<style lang="scss" scoped>
  .biz-error {
    @include flex-center;

    flex-direction: column;
    padding: 80rpx 32rpx;

    &__icon {
      width: 200rpx;
      height: 200rpx;
    }

    &__title {
      margin-top: 24rpx;
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__desc {
      margin-top: 12rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }

    &__actions {
      margin-top: 32rpx;
    }

    &__btn {
      padding: 16rpx 64rpx;
      font-size: $font-size-base;
      color: $color-primary;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-lg;
    }
  }
</style>
