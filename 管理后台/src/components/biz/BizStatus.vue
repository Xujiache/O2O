<!--
  BizStatus 业务状态徽章
  - 按 type + code 查询 status-map 中的标签 / 颜色
  - 自动 i18n（中英）
-->
<template>
  <ElTag
    v-if="item"
    :type="item.type === 'primary' ? 'primary' : item.type"
    :effect="effect"
    :size="size"
  >
    {{ label }}
  </ElTag>
  <span v-else>{{ code }}</span>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { ElTag } from 'element-plus'
  import { useI18n } from 'vue-i18n'
  import { findStatus, type StatusItem } from '@/utils/business/status-map'

  /**
   * BizStatus 组件 props
   */
  const props = withDefaults(
    defineProps<{
      /** 状态映射 type，如 'ORDER_STATUS' */
      type: string
      /** 状态 code（数字或字符串） */
      code: number | string
      /** 文字风格 */
      effect?: 'light' | 'dark' | 'plain'
      /** 大小 */
      size?: 'large' | 'default' | 'small'
    }>(),
    {
      effect: 'light',
      size: 'default'
    }
  )

  const { locale } = useI18n()

  const item = computed<StatusItem | undefined>(() => findStatus(props.type, props.code))
  const label = computed<string>(() => {
    if (!item.value) return String(props.code)
    if (locale.value === 'en' && item.value.labelEn) return item.value.labelEn
    return item.value.label
  })
</script>
