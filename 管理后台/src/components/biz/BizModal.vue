<!--
  BizModal 业务弹窗
  - 自带 loading / 确认 / 取消按钮
  - submit 后自动 close
  - 支持权限码（v-biz-auth）控制确认按钮
-->
<template>
  <ElDialog
    v-model="visible"
    :title="title"
    :width="width"
    :top="top"
    :close-on-click-modal="closeOnClickModal"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    :destroy-on-close="destroyOnClose"
    @close="onClose"
  >
    <slot :loading="loading" />
    <template v-if="showFooter" #footer>
      <slot name="footer" :loading="loading" :close="close" :submit="onSubmit">
        <ElButton :disabled="loading" @click="close">{{
          cancelText || $t('biz.common.cancel')
        }}</ElButton>
        <ElButton type="primary" :loading="loading" @click="onSubmit">
          {{ submitText || $t('biz.common.confirm') }}
        </ElButton>
      </slot>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { ElDialog, ElButton } from 'element-plus'

  const props = withDefaults(
    defineProps<{
      modelValue: boolean
      title?: string
      width?: string | number
      top?: string
      submitText?: string
      cancelText?: string
      closeOnClickModal?: boolean
      destroyOnClose?: boolean
      showFooter?: boolean
      onBeforeSubmit?: () => boolean | Promise<boolean>
    }>(),
    {
      title: '',
      width: '600px',
      top: '8vh',
      submitText: '',
      cancelText: '',
      closeOnClickModal: false,
      destroyOnClose: true,
      showFooter: true,
      onBeforeSubmit: undefined
    }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', val: boolean): void
    (e: 'submit'): void
    (e: 'close'): void
  }>()

  const visible = ref(props.modelValue)
  const loading = ref(false)
  watch(
    () => props.modelValue,
    (v) => {
      visible.value = v
    }
  )
  watch(visible, (v) => {
    emit('update:modelValue', v)
  })

  function close() {
    if (loading.value) return
    visible.value = false
  }

  function onClose() {
    emit('close')
  }

  async function onSubmit() {
    if (loading.value) return
    if (props.onBeforeSubmit) {
      const ok = await props.onBeforeSubmit()
      if (!ok) return
    }
    loading.value = true
    try {
      emit('submit')
    } finally {
      // submit 后由父组件控制是否关闭，这里不自动关闭，让业务层 await 后再 close
      setTimeout(() => {
        loading.value = false
      }, 100)
    }
  }

  defineExpose({ close, loading })
</script>
