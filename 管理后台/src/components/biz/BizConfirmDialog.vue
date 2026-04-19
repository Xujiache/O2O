<!--
  BizConfirmDialog 危险操作二次确认
  - 用户必须输入"确认"才能继续
  - 适用：封禁用户 / 强制下架商品 / 强制取消订单 / 删除管理员
  - ACCEPTANCE 安全要求
-->
<template>
  <ElDialog
    v-model="visible"
    :title="title"
    :width="width"
    :show-close="!loading"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
    align-center
  >
    <div class="biz-confirm">
      <div class="biz-confirm__icon">
        <ElIcon size="36" color="#f56c6c"><Warning /></ElIcon>
      </div>
      <div class="biz-confirm__body">
        <div class="biz-confirm__msg">
          <slot>{{ message }}</slot>
        </div>
        <div class="biz-confirm__hint">
          {{ hint || $t('biz.common.dangerHint') }}
        </div>
        <ElInput
          v-model="typed"
          :placeholder="confirmWord"
          :status="!matched && typed ? 'error' : ''"
          @keyup.enter="onSubmit"
        />
      </div>
    </div>
    <template #footer>
      <ElButton :disabled="loading" @click="close">{{ $t('biz.common.cancel') }}</ElButton>
      <ElButton type="danger" :disabled="!matched" :loading="loading" @click="onSubmit">
        {{ $t('biz.common.confirm') }}
      </ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { ElDialog, ElButton, ElInput, ElIcon } from 'element-plus'
  import { Warning } from '@element-plus/icons-vue'

  const props = withDefaults(
    defineProps<{
      modelValue: boolean
      title?: string
      width?: string | number
      message?: string
      hint?: string
      /** 用户必须输入的确认文字 */
      confirmWord?: string
    }>(),
    {
      title: '危险操作',
      width: '460px',
      message: '此操作不可恢复，请谨慎操作。',
      hint: '',
      confirmWord: '确认'
    }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', val: boolean): void
    (e: 'confirm'): void
  }>()

  const visible = ref(props.modelValue)
  const typed = ref('')
  const loading = ref(false)

  const matched = computed(() => typed.value.trim() === props.confirmWord)

  watch(
    () => props.modelValue,
    (v) => {
      visible.value = v
      if (v) typed.value = ''
    }
  )
  watch(visible, (v) => {
    emit('update:modelValue', v)
  })

  function close() {
    if (loading.value) return
    visible.value = false
  }

  async function onSubmit() {
    if (!matched.value || loading.value) return
    loading.value = true
    try {
      emit('confirm')
    } finally {
      setTimeout(() => {
        loading.value = false
      }, 200)
    }
  }

  defineExpose({ close, loading })
</script>

<style scoped lang="scss">
  .biz-confirm {
    display: flex;
    gap: 16px;
    align-items: flex-start;

    &__icon {
      flex-shrink: 0;
    }

    &__body {
      flex: 1;
    }

    &__msg {
      margin-bottom: 8px;
      font-size: 14px;
      color: var(--el-text-color-primary);
    }

    &__hint {
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
</style>
