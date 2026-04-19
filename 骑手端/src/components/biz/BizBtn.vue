<template>
  <button
    class="biz-btn"
    :class="[`biz-btn--${type}`, { 'biz-btn--block': block, 'biz-btn--disabled': disabled }]"
    :disabled="disabled"
    :hover-class="disabled ? '' : 'biz-btn--hover'"
    @click="onClick"
  >
    <slot>{{ text }}</slot>
  </button>
</template>

<script setup lang="ts">
  /**
   * 通用按钮组件（骑手端无 RBAC 子账号，无需 perm 校验）
   *
   * 用法：
   *   <BizBtn type="primary" block @click="accept">立即接单</BizBtn>
   *
   * @author 单 Agent V2.0 (P7 骑手端)
   */
  interface Props {
    /** 按钮类型 */
    type?: 'primary' | 'success' | 'danger' | 'warning' | 'default' | 'plain'
    /** 文本（无 slot 时使用） */
    text?: string
    /** 是否禁用 */
    disabled?: boolean
    /** 块状（占满父宽度） */
    block?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    type: 'default',
    text: '',
    disabled: false,
    block: false
  })

  const emit = defineEmits<{
    (e: 'click', event: Event): void
  }>()

  function onClick(e: Event) {
    if (props.disabled) return
    emit('click', e)
  }
</script>

<style lang="scss" scoped>
  .biz-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 144rpx;
    height: 64rpx;
    padding: 0 24rpx;
    margin: 0;
    font-size: 26rpx;
    line-height: 1;
    color: $uni-text-color;
    background: $uni-bg-color;
    border: 2rpx solid $uni-border-color;
    border-radius: $uni-border-radius-base;
    transition: opacity 0.15s;

    &::after {
      border: none;
    }

    &--block {
      display: flex;
      width: 100%;
    }

    &--hover {
      opacity: 0.85;
    }

    &--disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    &--primary {
      color: #fff;
      background: $uni-color-primary;
      border-color: $uni-color-primary;
    }

    &--success {
      color: #fff;
      background: $uni-color-success;
      border-color: $uni-color-success;
    }

    &--danger {
      color: #fff;
      background: $uni-color-error;
      border-color: $uni-color-error;
    }

    &--warning {
      color: #fff;
      background: $uni-color-warning;
      border-color: $uni-color-warning;
    }

    &--plain {
      color: $uni-color-primary;
      background: transparent;
      border-color: $uni-color-primary;
    }
  }
</style>
