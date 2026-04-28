<!--
  P8 推送模板管理
  - 模板列表 + 新增/编辑
-->
<template>
  <div class="biz-ops-push-template">
    <BizTable ref="tableRef" :columns="columns" :fetch="fetchList" row-key="id">
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增模板</ElButton>
      </template>
    </BizTable>

    <BizModal
      v-model="editVisible"
      :title="editing ? '编辑模板' : '新增模板'"
      width="640px"
      :show-footer="false"
    >
      <ElForm :model="form" label-width="90px">
        <ElFormItem label="模板编码" required>
          <ElInput v-model="form.code" :disabled="editing" />
        </ElFormItem>
        <ElFormItem label="模板名称" required>
          <ElInput v-model="form.name" />
        </ElFormItem>
        <ElFormItem label="通道" required>
          <ElCheckboxGroup v-model="form.channels">
            <ElCheckbox value="mp">小程序</ElCheckbox>
            <ElCheckbox value="app">APP</ElCheckbox>
            <ElCheckbox value="sms">短信</ElCheckbox>
            <ElCheckbox value="inbox">站内信</ElCheckbox>
          </ElCheckboxGroup>
        </ElFormItem>
        <ElFormItem label="内容" required>
          <ElInput v-model="form.content" type="textarea" :rows="5" />
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
  import { ref, reactive } from 'vue'
  import {
    ElButton,
    ElCheckbox,
    ElCheckboxGroup,
    ElForm,
    ElFormItem,
    ElInput,
    ElMessage
  } from 'element-plus'
  import { opsApi } from '@/api/business'
  import type { BizId } from '@/types/business'
  import { BizModal, BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'

  interface PushTemplateRow {
    id?: BizId
    code: string
    name: string
    channels: string[]
    content: string
  }

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)

  const form = reactive<PushTemplateRow>({
    code: '',
    name: '',
    channels: ['app'],
    content: ''
  })

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'code', label: '模板编码', width: 160 },
    { prop: 'name', label: '模板名称', minWidth: 180 },
    {
      prop: 'channels',
      label: '通道',
      minWidth: 180,
      formatter: (_r, _c, v) => (Array.isArray(v) ? (v as string[]).join(' / ') : '-')
    },
    { prop: 'content', label: '内容', minWidth: 240 }
  ]

  function onCreate() {
    editing.value = false
    Object.assign(form, { code: '', name: '', channels: ['app'], content: '' })
    editVisible.value = true
  }

  async function onSave() {
    if (!form.code || !form.name || !form.channels.length || !form.content) {
      ElMessage.warning('请完整填写')
      return
    }
    loading.value = true
    try {
      await opsApi.pushTemplateSave(form)
      ElMessage.success('已保存')
      editVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
    } finally {
      loading.value = false
    }
  }

  async function fetchList() {
    const rows = await opsApi.pushTemplateList()
    return {
      records: rows as unknown as Record<string, unknown>[],
      total: rows.length,
      page: 1,
      pageSize: rows.length || 20
    }
  }
</script>

<style scoped lang="scss">
  .biz-ops-push-template {
    padding: 12px;
  }
</style>
