<template>
  <button
    v-if="visible"
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
  import { computed } from 'vue'
  import { hasPerm, hasAnyPerm } from '@/utils/permission'

  /**
   * 权限按钮组件
   *
   * 用法：
   *   <BizBtn perm="order:accept" type="primary" @click="accept">接单</BizBtn>
   *   <BizBtn :perms="['order:accept', 'order:cook']" any text="操作" />
   *
   * 行为：
   *   - 无权限时：默认隐藏（hideOnNoPerm=true）；可设为禁用 mode
   *   - 主账号（无权限码）：始终显示
   *
   * @author 单 Agent V2.0 (P6 商户端 / T6.5)
   */
  interface Props {
    /** 单个权限码 */
    perm?: string
    /** 多个权限码 */
    perms?: string[]
    /** 多权限模式：any 任一 / all 全部 */
    mode?: 'any' | 'all'
    /** 按钮类型 */
    type?: 'primary' | 'success' | 'danger' | 'warning' | 'default' | 'plain'
    /** 文本（无 slot 时使用） */
    text?: string
    /** 是否禁用 */
    disabled?: boolean
    /** 块状（占满父宽度） */
    block?: boolean
    /** 无权限时的处理：hide 隐藏 / disable 禁用 */
    onNoPerm?: 'hide' | 'disable'
  }

  const props = withDefaults(defineProps<Props>(), {
    perm: undefined,
    perms: () => [],
    mode: 'any',
    type: 'default',
    text: '',
    disabled: false,
    block: false,
    onNoPerm: 'hide'
  })

  const emit = defineEmits<{
    (e: 'click', event: Event): void
  }>()

  const hasPermission = computed<boolean>(() => {
    if (props.perm) return hasPerm(props.perm)
    if (props.perms.length > 0) {
      if (props.mode === 'all') return props.perms.every((p) => hasPerm(p))
      return hasAnyPerm(props.perms)
    }
    return true
  })

  const visible = computed<boolean>(() => {
    if (hasPermission.value) return true
    return props.onNoPerm === 'disable'
  })

  const finalDisabled = computed<boolean>(() => {
    if (props.disabled) return true
    if (!hasPermission.value && props.onNoPerm === 'disable') return true
    return false
  })

  function onClick(e: Event) {
    if (finalDisabled.value) return
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
