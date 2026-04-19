<!--
  P8 公告（V8.21 富文本）
  - wangEditor 富文本编辑器
-->
<template>
  <div class="biz-content-notice">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增公告</ElButton>
      </template>
    </BizTable>

    <BizModal
      v-model="editVisible"
      :title="editing ? '编辑公告' : '新增公告'"
      width="900px"
      :show-footer="false"
    >
      <ElForm :model="form" label-width="100px">
        <ElFormItem label="标题" required>
          <ElInput v-model="form.title" />
        </ElFormItem>
        <ElFormItem label="受众">
          <ElRadioGroup v-model="form.audience">
            <ElRadio value="all">全部</ElRadio>
            <ElRadio value="user">用户</ElRadio>
            <ElRadio value="merchant">商户</ElRadio>
            <ElRadio value="rider">骑手</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="内容" required>
          <Toolbar
            v-if="editorRef"
            :editor="editorRef"
            mode="default"
            :default-config="toolbarConfig"
            style="border: 1px solid #e8e8e8"
          />
          <Editor
            v-model="form.content"
            mode="default"
            :default-config="editorConfig"
            style="height: 320px; overflow-y: auto; border: 1px solid #e8e8e8"
            @on-created="onEditorCreated"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="loading" @click="onSave">保存</ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, shallowRef, onBeforeUnmount } from 'vue'
  import {
    ElForm,
    ElFormItem,
    ElInput,
    ElRadioGroup,
    ElRadio,
    ElButton,
    ElMessage,
    ElMessageBox
  } from 'element-plus'
  import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
  import '@wangeditor/editor/dist/css/style.css'
  import { contentApi } from '@/api/business'
  import type { BizNotice, BizListParams, BizId } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '标题' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'title', label: '标题', minWidth: 200 },
    { prop: 'audience', label: '受众', width: 100 },
    { prop: 'cityCode', label: '城市', width: 100 },
    {
      prop: 'publishAt',
      label: '发布时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    },
    {
      prop: 'expireAt',
      label: '过期时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)
  const currentId = ref<BizId | null>(null)
  const form = reactive<Partial<BizNotice>>({
    title: '',
    content: '',
    audience: 'all',
    enabled: true
  })

  const editorRef = shallowRef()
  const toolbarConfig = {}
  const editorConfig = { placeholder: '请输入公告内容...' }

  function onEditorCreated(editor: unknown) {
    editorRef.value = editor
  }
  onBeforeUnmount(() => {
    const editor = editorRef.value as { destroy?: () => void } | null
    editor?.destroy?.()
  })

  function onCreate() {
    editing.value = false
    Object.assign(form, { title: '', content: '', audience: 'all', enabled: true })
    currentId.value = null
    editVisible.value = true
  }

  const rowActions: BizRowAction[] = [
    {
      label: '编辑',
      type: 'primary',
      onClick: (row) => {
        const n = row as unknown as BizNotice
        editing.value = true
        currentId.value = n.id
        Object.assign(form, n)
        editVisible.value = true
      }
    },
    {
      label: '删除',
      type: 'danger',
      onClick: async (row) => {
        const n = row as unknown as BizNotice
        await ElMessageBox.confirm(`确认删除「${n.title}」?`, '提示', { type: 'warning' })
        await contentApi.noticeDelete(n.id)
        ElMessage.success('已删除')
        tableRef.value?.reload()
      }
    }
  ]

  async function onSave() {
    if (!form.title || !form.content) {
      ElMessage.warning('请完整填写')
      return
    }
    loading.value = true
    try {
      if (editing.value && currentId.value) {
        await contentApi.noticeUpdate(currentId.value, form)
      } else {
        await contentApi.noticeSave(form)
      }
      ElMessage.success('已保存')
      editVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
    } finally {
      loading.value = false
    }
  }

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string
    }
    const resp = await contentApi.noticeList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-content-notice {
    padding: 12px;
  }
</style>
