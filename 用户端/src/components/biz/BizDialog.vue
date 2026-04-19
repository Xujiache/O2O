<template>
  <view v-if="visible" class="biz-dialog" @tap="onMaskTap">
    <view class="biz-dialog__panel" @tap.stop>
      <view v-if="title" class="biz-dialog__title">{{ title }}</view>
      <view class="biz-dialog__body">
        <slot>
          <text>{{ content }}</text>
        </slot>
      </view>
      <view class="biz-dialog__footer">
        <view v-if="showCancel" class="biz-dialog__btn biz-dialog__btn--cancel" @tap="onCancel">
          {{ cancelText }}
        </view>
        <view class="biz-dialog__btn biz-dialog__btn--confirm" @tap="onConfirm">
          {{ confirmText }}
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file BizDialog.vue
   * @stage P5/T5.7 (Sprint 1)
   * @desc 通用确认弹窗：标题 + 内容 + 取消/确认；slot 支持自定义内容
   * @author 单 Agent V2.0
   */
  import { withDefaults, defineProps, defineEmits } from 'vue'

  withDefaults(
    defineProps<{
      visible: boolean
      title?: string
      content?: string
      confirmText?: string
      cancelText?: string
      showCancel?: boolean
      maskClosable?: boolean
    }>(),
    {
      title: '提示',
      content: '',
      confirmText: '确定',
      cancelText: '取消',
      showCancel: true,
      maskClosable: false
    }
  )

  const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'confirm'): void
    (e: 'cancel'): void
  }>()

  function onConfirm() {
    emit('confirm')
    emit('update:visible', false)
  }

  function onCancel() {
    emit('cancel')
    emit('update:visible', false)
  }

  function onMaskTap() {
    emit('update:visible', false)
  }
</script>

<style lang="scss" scoped>
  .biz-dialog {
    @include flex-center;

    position: fixed;
    inset: 0;
    z-index: $z-index-modal;
    background: $color-bg-mask;

    &__panel {
      width: 600rpx;
      max-width: 80vw;
      overflow: hidden;
      background: $color-bg-white;
      border-radius: $radius-lg;
    }

    &__title {
      padding: 32rpx 32rpx 16rpx;
      font-size: $font-size-md;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      text-align: center;
    }

    &__body {
      padding: 16rpx 32rpx 32rpx;
      font-size: $font-size-base;
      line-height: 1.5;
      color: $color-text-regular;
      text-align: center;
    }

    &__footer {
      display: flex;
      border-top: 1rpx solid $color-divider;
    }

    &__btn {
      flex: 1;
      height: 96rpx;
      font-size: $font-size-base;
      line-height: 96rpx;
      text-align: center;

      &--cancel {
        color: $color-text-regular;
        border-right: 1rpx solid $color-divider;
      }

      &--confirm {
        font-weight: $font-weight-medium;
        color: $color-primary;
      }

      &:active {
        background: $color-bg-hover;
      }
    }
  }
</style>
