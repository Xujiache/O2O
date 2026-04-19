<!--
  BizSearchForm 业务搜索表单（schema 驱动）

  支持字段类型：input / select / date / dateRange / number / cascader

  示例：
  ```vue
  <BizSearchForm
    :schema="[
      { type: 'input', field: 'keyword', label: '关键词', placeholder: '订单号/手机' },
      { type: 'select', field: 'status', label: '状态', options: [...] },
      { type: 'dateRange', field: 'range', label: '时间' },
    ]"
    v-model="form"
    @search="onSearch"
    @reset="onReset"
  />
  ```
-->
<template>
  <ElForm
    ref="formRef"
    inline
    :model="formModel"
    label-width="auto"
    class="biz-search-form"
    @submit.prevent
  >
    <ElFormItem v-for="field in visibleSchema" :key="field.field" :label="field.label">
      <template v-if="field.type === 'input'">
        <ElInput
          :model-value="strVal(field.field)"
          :placeholder="field.placeholder || $t('biz.common.search')"
          clearable
          :style="{ width: field.width || '180px' }"
          @update:model-value="(v) => setField(field.field, v)"
        />
      </template>
      <template v-else-if="field.type === 'number'">
        <ElInputNumber
          :model-value="numVal(field.field)"
          :min="field.min"
          :max="field.max"
          :step="field.step || 1"
          controls-position="right"
          @update:model-value="(v) => setField(field.field, v)"
        />
      </template>
      <template v-else-if="field.type === 'select'">
        <ElSelect
          :model-value="anyVal(field.field)"
          :placeholder="field.placeholder || $t('biz.common.search')"
          clearable
          filterable
          :style="{ width: field.width || '180px' }"
          @update:model-value="(v) => setField(field.field, v)"
        >
          <ElOption
            v-for="opt in optionList(field)"
            :key="String(opt.value)"
            :value="opt.value"
            :label="opt.label"
          />
        </ElSelect>
      </template>
      <template v-else-if="field.type === 'date'">
        <ElDatePicker
          :model-value="strVal(field.field)"
          type="date"
          :placeholder="field.placeholder || ''"
          value-format="YYYY-MM-DD"
          clearable
          @update:model-value="(v) => setField(field.field, v)"
        />
      </template>
      <template v-else-if="field.type === 'dateRange'">
        <BizDateRange
          :model-value="rangeVal(field.field)"
          @change="(v) => setField(field.field, v)"
        />
      </template>
      <template v-else-if="field.type === 'cascader'">
        <ElCascader
          :model-value="anyVal(field.field)"
          :options="cascaderOptions(field)"
          :props="cascaderProps(field)"
          clearable
          @update:model-value="(v) => setField(field.field, v)"
        />
      </template>
    </ElFormItem>
    <ElFormItem v-if="schema.length > 0">
      <ElButton type="primary" @click="emitSearch">{{ $t('biz.common.search') }}</ElButton>
      <ElButton @click="emitReset">{{ $t('biz.common.reset') }}</ElButton>
      <slot name="extra" />
    </ElFormItem>
  </ElForm>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import {
    ElForm,
    ElFormItem,
    ElInput,
    ElInputNumber,
    ElSelect,
    ElOption,
    ElDatePicker,
    ElCascader,
    ElButton
  } from 'element-plus'
  import BizDateRange from './BizDateRange.vue'

  /** 字段 schema 类型 */
  export interface BizSearchField {
    type: 'input' | 'number' | 'select' | 'date' | 'dateRange' | 'cascader'
    field: string
    label: string
    placeholder?: string
    options?: Array<{ value: unknown; label: string }>
    width?: string
    min?: number
    max?: number
    step?: number
    cascaderProps?: Record<string, unknown>
    /** 条件性显示 */
    visible?: boolean | ((model: Record<string, unknown>) => boolean)
  }

  const props = withDefaults(
    defineProps<{
      schema: BizSearchField[]
      modelValue?: Record<string, unknown>
    }>(),
    {
      modelValue: () => ({})
    }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', val: Record<string, unknown>): void
    (e: 'search', val: Record<string, unknown>): void
    (e: 'reset'): void
  }>()

  const formModel = ref<Record<string, unknown>>({ ...props.modelValue })

  watch(
    () => props.modelValue,
    (val) => {
      formModel.value = { ...val }
    },
    { deep: true }
  )

  const visibleSchema = computed(() =>
    props.schema.filter((f) => {
      if (f.visible === undefined) return true
      if (typeof f.visible === 'boolean') return f.visible
      return f.visible(formModel.value)
    })
  )

  function setField(name: string, val: unknown) {
    formModel.value[name] = val
  }

  function strVal(name: string): string {
    const v = formModel.value[name]
    if (v === undefined || v === null) return ''
    return String(v)
  }
  function numVal(name: string): number | undefined {
    const v = formModel.value[name]
    if (v === undefined || v === null) return undefined
    return Number(v)
  }
  function anyVal(name: string): string | number | (string | number)[] {
    const v = formModel.value[name]
    return (v ?? '') as string | number | (string | number)[]
  }
  function rangeVal(name: string): [string, string] | [Date, Date] | null {
    const v = formModel.value[name]
    return (v ?? null) as [string, string] | [Date, Date] | null
  }
  function optionList(f: BizSearchField): Array<{ value: string | number; label: string }> {
    return (f.options || []).map((o) => ({ value: o.value as string | number, label: o.label }))
  }
  function cascaderOptions(f: BizSearchField): Array<Record<string, unknown>> {
    return (f.options as unknown as Array<Record<string, unknown>>) || []
  }
  function cascaderProps(f: BizSearchField): Record<string, unknown> {
    return (f.cascaderProps as Record<string, unknown>) || {}
  }

  function emitSearch() {
    emit('update:modelValue', { ...formModel.value })
    emit('search', { ...formModel.value })
  }
  function emitReset() {
    formModel.value = {}
    emit('update:modelValue', {})
    emit('reset')
    emit('search', {})
  }
</script>

<style scoped lang="scss">
  .biz-search-form {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;
    padding: 12px 16px;
    margin-bottom: 12px;
    background: var(--art-main-bg-color);
    border-radius: 6px;
  }
</style>
