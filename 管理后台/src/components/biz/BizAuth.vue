<!--
  BizAuth 业务权限控制组件
  - 渲染前检查权限码（基于 BizPermStore）
  - 不通过则不渲染（占位为空）
  - 适用于：权限不足时整块隐藏
-->
<template>
  <slot v-if="ok" />
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useBizPermStore } from '@/store/modules/business'

  const props = withDefaults(
    defineProps<{
      /** 单个权限码 或 权限码数组（任一即通过） */
      code: string | string[]
      /** 反向：无权限时显示 */
      negate?: boolean
    }>(),
    {
      negate: false
    }
  )
  const perm = useBizPermStore()
  const ok = computed(() => {
    let pass = false
    if (Array.isArray(props.code)) pass = perm.hasAny(props.code)
    else pass = perm.has(props.code)
    return props.negate ? !pass : pass
  })
</script>
