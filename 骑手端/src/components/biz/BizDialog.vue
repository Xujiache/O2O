<template>
  <view v-if="show" class="biz-dialog" @click.self="onMaskClick">
    <view class="biz-dialog__inner">
      <view v-if="title" class="biz-dialog__title">{{ title }}</view>
      <view class="biz-dialog__body">
        <slot>{{ content }}</slot>
      </view>
      <view class="biz-dialog__footer">
        <button v-if="showCancel" class="biz-dialog__btn" @click="onCancel">{{
          cancelText
        }}</button>
        <button class="biz-dialog__btn biz-dialog__btn--primary" @click="onConfirm">
          {{ confirmText }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * 通用确认对话框
   *
   * 用法：
   *   <BizDialog v-model:show="visible" title="确认接单" content="..." @confirm="ok" />
   *
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  interface Props {
    show: boolean
    title?: string
    content?: string
    showCancel?: boolean
    cancelText?: string
    confirmText?: string
    /** 点击遮罩是否关闭 */
    closeOnMask?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    show: false,
    title: '',
    content: '',
    showCancel: true,
    cancelText: '取消',
    confirmText: '确定',
    closeOnMask: false
  })

  const emit = defineEmits<{
    (e: 'update:show', v: boolean): void
    (e: 'confirm'): void
    (e: 'cancel'): void
  }>()

  function onCancel() {
    emit('update:show', false)
    emit('cancel')
  }

  function onConfirm() {
    emit('update:show', false)
    emit('confirm')
  }

  function onMaskClick() {
    if (!props.closeOnMask) return
    onCancel()
  }
</script>

<style lang="scss" scoped>
  .biz-dialog {
    position: fixed;
    inset: 0;
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: $uni-bg-color-mask;

    &__inner {
      width: 600rpx;
      padding: 48rpx 32rpx 24rpx;
      background: #fff;
      border-radius: $rider-modal-radius;
    }

    &__title {
      margin-bottom: 24rpx;
      font-size: 32rpx;
      font-weight: 600;
      color: $uni-text-color;
      text-align: center;
    }

    &__body {
      max-height: 600rpx;
      padding-bottom: 32rpx;
      margin-bottom: 24rpx;
      overflow-y: auto;
      font-size: 28rpx;
      line-height: 1.6;
      color: $uni-text-color;
      text-align: center;
    }

    &__footer {
      display: flex;
      gap: 24rpx;
    }

    &__btn {
      flex: 1;
      height: 80rpx;
      font-size: 28rpx;
      line-height: 80rpx;
      color: $uni-text-color-grey;
      background: $uni-bg-color-grey;
      border: none;
      border-radius: $uni-border-radius-base;

      &::after {
        border: none;
      }

      &--primary {
        color: #fff;
        background: $uni-color-primary;
      }
    }
  }
</style>
