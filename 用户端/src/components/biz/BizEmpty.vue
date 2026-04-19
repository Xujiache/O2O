<template>
  <view class="biz-empty">
    <image class="biz-empty__icon" :src="icon" mode="aspectFit" />
    <text class="biz-empty__text">{{ text }}</text>
    <view v-if="actionText" class="biz-empty__action" @tap="onAction">
      <text class="biz-empty__action-text">{{ actionText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file BizEmpty.vue
   * @stage P5/T5.7 (Sprint 1)
   * @desc 通用空态组件：默认插画 + 文案 + 可选按钮
   * @author 单 Agent V2.0
   */
  import { withDefaults, defineProps, defineEmits } from 'vue'

  /** 组件 Props */
  const props = withDefaults(
    defineProps<{
      /** 文案 */
      text?: string
      /** 自定义图片 URL */
      icon?: string
      /** 按钮文案，传入即显示 */
      actionText?: string
    }>(),
    {
      text: '暂无数据',
      icon: 'https://cdn.uviewui.com/uview/empty/data.png',
      actionText: ''
    }
  )

  const emit = defineEmits<{ (e: 'action'): void }>()

  /** 触发按钮点击 */
  function onAction() {
    emit('action')
  }

  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  const _ = props
</script>

<style lang="scss" scoped>
  .biz-empty {
    @include flex-center;

    flex-direction: column;
    padding: 80rpx 32rpx;

    &__icon {
      width: 240rpx;
      height: 240rpx;
    }

    &__text {
      margin-top: 24rpx;
      font-size: $font-size-base;
      color: $color-text-secondary;
    }

    &__action {
      margin-top: 32rpx;
      padding: 12rpx 48rpx;
      background: $color-primary;
      border-radius: $radius-lg;
    }

    &__action-text {
      font-size: $font-size-sm;
      color: $color-text-inverse;
    }
  }
</style>
