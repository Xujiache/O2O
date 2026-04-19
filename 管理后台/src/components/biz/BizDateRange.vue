<!--
  BizDateRange 业务日期范围选择
  - 含快捷选项（今日 / 昨日 / 近 7 / 近 30 / 本月 / 上月）
  - 双向绑定 [Date, Date] | [string, string]
-->
<template>
  <ElDatePicker
    :model-value="modelValue"
    type="daterange"
    :range-separator="$t('biz.common.selectDateRange')"
    :start-placeholder="$t('biz.common.today')"
    :end-placeholder="$t('biz.common.today')"
    :shortcuts="shortcuts"
    :value-format="valueFormat"
    :clearable="clearable"
    @update:model-value="onUpdate"
  />
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { ElDatePicker } from 'element-plus'
  import { useI18n } from 'vue-i18n'
  import { getDateRangeShortcuts } from '@/utils/business/format'

  /**
   * BizDateRange props
   */
  withDefaults(
    defineProps<{
      modelValue?: [string, string] | [Date, Date] | null
      /** value 序列化格式 */
      valueFormat?: string
      /** 是否可清空 */
      clearable?: boolean
    }>(),
    {
      modelValue: null,
      valueFormat: 'YYYY-MM-DD HH:mm:ss',
      clearable: true
    }
  )
  const emit = defineEmits<{
    (e: 'update:modelValue', val: [string, string] | [Date, Date] | null): void
    (e: 'change', val: [string, string] | [Date, Date] | null): void
  }>()
  const { t } = useI18n()
  const shortcuts = computed(() =>
    getDateRangeShortcuts().map((sc) => ({
      text: t(`biz.common.${labelKey(sc.text)}`),
      value: sc.value
    }))
  )
  function labelKey(zh: string): string {
    switch (zh) {
      case '今日':
        return 'today'
      case '昨日':
        return 'yesterday'
      case '近 7 天':
        return 'last7'
      case '近 30 天':
        return 'last30'
      case '本月':
        return 'thisMonth'
      case '上月':
        return 'lastMonth'
      default:
        return 'today'
    }
  }
  function onUpdate(val: [string, string] | [Date, Date] | null) {
    emit('update:modelValue', val)
    emit('change', val)
  }
</script>
