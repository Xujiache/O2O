<!--
  BizJsonViewer JSON 可视化编辑（V8.36 system-config / app-config 用）
  - 树形展示
  - 单元格内编辑（string/number/boolean）
  - 整体校验合法性
  - 支持回滚 / 重置 / 复制
-->
<template>
  <div class="biz-json-viewer">
    <div class="biz-json-viewer__toolbar">
      <ElRadioGroup v-model="mode" size="small">
        <ElRadioButton value="tree">树形</ElRadioButton>
        <ElRadioButton value="raw">原始 JSON</ElRadioButton>
      </ElRadioGroup>
      <div class="biz-json-viewer__actions">
        <ElButton size="small" @click="copyJson">复制</ElButton>
        <ElButton size="small" @click="reset" :disabled="!dirty">重置</ElButton>
        <ElButton v-if="!readonly" size="small" type="primary" :disabled="!valid" @click="onSave"
          >保存</ElButton
        >
      </div>
    </div>

    <div v-show="mode === 'tree'" class="biz-json-viewer__tree">
      <div
        v-for="(item, idx) in flatten"
        :key="idx"
        class="biz-json-viewer__row"
        :style="{ paddingLeft: 16 + item.depth * 16 + 'px' }"
      >
        <span
          class="biz-json-viewer__key"
          :class="{ 'biz-json-viewer__key--obj': item.type === 'object' }"
        >
          {{ item.key }}
        </span>
        <span v-if="item.type === 'object'" class="biz-json-viewer__sep">{{
          item.isArray ? '[ Array ]' : '{ Object }'
        }}</span>
        <template v-else>
          <span class="biz-json-viewer__sep">:</span>
          <ElInput
            v-if="item.type === 'string'"
            v-model="item.value as string"
            size="small"
            :readonly="readonly"
            :disabled="readonly"
            @change="onLeafChange(item)"
          />
          <ElInputNumber
            v-else-if="item.type === 'number'"
            :model-value="item.value as number"
            size="small"
            :disabled="readonly"
            @change="
              (v) => {
                item.value = v ?? 0
                onLeafChange(item)
              }
            "
          />
          <ElSwitch
            v-else-if="item.type === 'boolean'"
            v-model="item.value as boolean"
            :disabled="readonly"
            @change="onLeafChange(item)"
          />
          <span v-else class="biz-json-viewer__null">null</span>
        </template>
      </div>
    </div>

    <div v-show="mode === 'raw'" class="biz-json-viewer__raw">
      <ElInput
        v-model="rawText"
        type="textarea"
        :rows="18"
        :readonly="readonly"
        :status="!valid && rawText ? 'error' : ''"
        @input="onRawChange"
      />
      <p v-if="!valid && rawText" class="biz-json-viewer__error">JSON 解析失败</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import {
    ElRadioGroup,
    ElRadioButton,
    ElButton,
    ElInput,
    ElInputNumber,
    ElSwitch,
    ElMessage
  } from 'element-plus'

  type Json = unknown

  const props = withDefaults(
    defineProps<{
      modelValue: Record<string, Json>
      readonly?: boolean
    }>(),
    {
      readonly: false
    }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', val: Record<string, Json>): void
    (e: 'save', val: Record<string, Json>): void
  }>()

  const mode = ref<'tree' | 'raw'>('tree')
  const original = ref<string>(JSON.stringify(props.modelValue, null, 2))
  const rawText = ref<string>(original.value)
  const valid = ref(true)
  const dirty = ref(false)

  type FlatItem = {
    key: string
    path: (string | number)[]
    depth: number
    type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
    isArray?: boolean
    value: Json
  }

  const internal = ref<Record<string, Json>>(JSON.parse(original.value))

  const flatten = computed<FlatItem[]>(() => {
    const out: FlatItem[] = []
    const walk = (val: Json, key: string, path: (string | number)[], depth: number) => {
      if (val === null || val === undefined) {
        out.push({ key, path, depth, type: 'null', value: null })
        return
      }
      if (Array.isArray(val)) {
        out.push({ key, path, depth, type: 'object', isArray: true, value: val })
        val.forEach((v, idx) => walk(v, `[${idx}]`, [...path, idx], depth + 1))
        return
      }
      if (typeof val === 'object') {
        out.push({ key, path, depth, type: 'object', isArray: false, value: val })
        Object.entries(val as Record<string, Json>).forEach(([k, v]) =>
          walk(v, k, [...path, k], depth + 1)
        )
        return
      }
      out.push({
        key,
        path,
        depth,
        type: typeof val as 'string' | 'number' | 'boolean',
        value: val
      })
    }
    walk(internal.value, 'root', [], 0)
    return out.slice(1) // 移除根
  })

  watch(
    () => props.modelValue,
    (val) => {
      const fresh = JSON.stringify(val, null, 2)
      original.value = fresh
      rawText.value = fresh
      internal.value = JSON.parse(fresh)
      dirty.value = false
      valid.value = true
    },
    { deep: true }
  )

  function deepSet(obj: Record<string, Json>, path: (string | number)[], value: Json) {
    if (path.length === 0) return
    let cur: unknown = obj
    for (let i = 0; i < path.length - 1; i++) {
      cur = (cur as Record<string | number, unknown>)[path[i] as never] as unknown
    }
    ;(cur as Record<string | number, unknown>)[path[path.length - 1] as never] = value
  }

  function onLeafChange(item: FlatItem) {
    deepSet(internal.value, item.path, item.value)
    rawText.value = JSON.stringify(internal.value, null, 2)
    dirty.value = true
    valid.value = true
  }

  function onRawChange(v: string) {
    rawText.value = v
    try {
      internal.value = JSON.parse(v)
      valid.value = true
      dirty.value = true
    } catch {
      valid.value = false
    }
  }

  function reset() {
    rawText.value = original.value
    internal.value = JSON.parse(original.value)
    valid.value = true
    dirty.value = false
  }

  function copyJson() {
    navigator.clipboard
      .writeText(JSON.stringify(internal.value, null, 2))
      .then(() => ElMessage.success('已复制'))
      .catch(() => ElMessage.error('复制失败'))
  }

  function onSave() {
    if (!valid.value) {
      ElMessage.warning('JSON 不合法')
      return
    }
    emit('update:modelValue', internal.value)
    emit('save', internal.value)
    original.value = JSON.stringify(internal.value, null, 2)
    dirty.value = false
  }
</script>

<style scoped lang="scss">
  .biz-json-viewer {
    background: var(--el-bg-color);

    &__toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__actions {
      display: flex;
      gap: 8px;
    }

    &__tree {
      max-height: 480px;
      padding: 8px 0;
      overflow-y: auto;
    }

    &__row {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 4px 8px;
      font-size: 13px;
      line-height: 28px;
      border-bottom: 1px dashed var(--el-border-color-lighter);
    }

    &__key {
      min-width: 120px;
      font-family: var(--el-font-family-monospace, monospace);
      color: var(--el-color-primary);

      &--obj {
        font-weight: 600;
      }
    }

    &__sep {
      color: var(--el-text-color-secondary);
    }

    &__null {
      font-style: italic;
      color: var(--el-color-info);
    }

    &__raw {
      padding-top: 8px;
    }

    &__error {
      margin-top: 8px;
      font-size: 12px;
      color: var(--el-color-danger);
    }
  }
</style>
