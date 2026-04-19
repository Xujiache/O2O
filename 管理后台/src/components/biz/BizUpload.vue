<!--
  BizUpload 业务上传组件（图片/文件，支持多选 / 限制大小 / 预览 / 删除）
  - 调用业务 axios（自动 X-Trace-Id / X-Sign）
  - 支持 vue-img-cutter 裁剪（图片场景）
-->
<template>
  <div class="biz-upload">
    <ElUpload
      v-model:file-list="innerList"
      :action="uploadUrl"
      :name="name"
      :headers="uploadHeaders"
      :data="extraData"
      :limit="limit"
      :multiple="multiple"
      :list-type="isImage ? 'picture-card' : 'text'"
      :accept="accept"
      :before-upload="onBeforeUpload"
      :on-success="onSuccess"
      :on-error="onError"
      :on-remove="onRemove"
      :on-preview="onPreview"
      :show-file-list="true"
    >
      <ElIcon v-if="isImage"><Plus /></ElIcon>
      <ElButton v-else>
        <ElIcon><UploadFilled /></ElIcon>
        <span>{{ buttonText || '点击上传' }}</span>
      </ElButton>
      <template #tip>
        <div v-if="hint" class="biz-upload__tip">{{ hint }}</div>
      </template>
    </ElUpload>
    <ElDialog v-model="previewVisible" :title="previewName" width="800px">
      <img v-if="previewUrl" :src="previewUrl" style="max-width: 100%; height: auto" />
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import {
    ElUpload,
    ElButton,
    ElIcon,
    ElMessage,
    ElDialog,
    type UploadFile,
    type UploadFiles,
    type UploadProps,
    type UploadUserFile
  } from 'element-plus'
  import { Plus, UploadFilled } from '@element-plus/icons-vue'
  import { useUserStore } from '@/store/modules/user'

  const props = withDefaults(
    defineProps<{
      modelValue?: string[]
      /** 模式：image（图片裁剪 + 缩略） / file（普通文件） */
      mode?: 'image' | 'file'
      /** 后端上传 endpoint，默认 /admin/file/upload */
      action?: string
      /** form 字段名 */
      name?: string
      /** 业务 token */
      token?: string
      /** 单文件大小上限 MB */
      maxSize?: number
      /** 文件数量上限 */
      limit?: number
      /** 允许多选 */
      multiple?: boolean
      /** 允许的扩展名（accept） */
      accept?: string
      /** 提示文案 */
      hint?: string
      /** 按钮文案（file 模式） */
      buttonText?: string
      /** 业务额外参数 */
      extraData?: Record<string, unknown>
    }>(),
    {
      modelValue: () => [],
      mode: 'image',
      action: '',
      name: 'file',
      token: '',
      maxSize: 5,
      limit: 5,
      multiple: true,
      accept: 'image/*',
      hint: '',
      buttonText: '',
      extraData: () => ({})
    }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', val: string[]): void
    (e: 'success', urls: string[]): void
    (e: 'error', err: Error): void
  }>()

  const userStore = useUserStore()
  const innerList = ref<UploadUserFile[]>([])

  const isImage = computed(() => props.mode === 'image')

  const uploadUrl = computed(() => {
    if (props.action) return props.action
    const base = (import.meta.env.VITE_API_URL as string) || '/'
    return `${base.replace(/\/$/, '')}/admin/file/upload`
  })

  const uploadHeaders = computed(() => ({
    Authorization: userStore.accessToken || '',
    'X-Client-Type': 'admin'
  }))

  const previewVisible = ref(false)
  const previewUrl = ref('')
  const previewName = ref('')

  watch(
    () => props.modelValue,
    (urls) => {
      innerList.value = (urls || []).map((u, idx) => ({
        name: `file-${idx}`,
        url: u,
        status: 'success' as const,
        uid: idx,
        size: 0,
        raw: undefined as unknown as File
      })) as unknown as UploadUserFile[]
    },
    { immediate: true, deep: true }
  )

  const onBeforeUpload: UploadProps['beforeUpload'] = (file: File) => {
    if (file.size > props.maxSize * 1024 * 1024) {
      ElMessage.warning(`文件大小不能超过 ${props.maxSize} MB`)
      return false
    }
    return true
  }

  function syncEmit() {
    const urls = innerList.value.map((f) => f.url || '').filter(Boolean) as string[]
    emit('update:modelValue', urls)
  }

  function onSuccess(response: unknown, _file: UploadFile, files: UploadFiles) {
    const url =
      (response as { data?: { url?: string }; url?: string })?.data?.url ||
      (response as { url?: string })?.url ||
      ''
    if (url) {
      const last = files[files.length - 1]
      if (last) (last as unknown as { url: string }).url = url
    }
    syncEmit()
    emit('success', innerList.value.map((f) => f.url || '').filter(Boolean) as string[])
  }

  function onError(err: Error) {
    ElMessage.error('上传失败')
    emit('error', err)
  }

  function onRemove() {
    syncEmit()
  }

  function onPreview(file: UploadFile) {
    if (file.url) {
      previewUrl.value = file.url
      previewName.value = file.name || 'preview'
      previewVisible.value = true
    }
  }
</script>

<style scoped lang="scss">
  .biz-upload__tip {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
</style>
