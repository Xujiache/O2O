<!--
  P8 快捷入口管理
  - 列表 + 新增/编辑 + 删除
-->
<template>
  <div class="biz-content-quick-entry">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增快捷入口</ElButton>
      </template>
    </BizTable>

    <BizModal
      v-model="editVisible"
      :title="editing ? '编辑快捷入口' : '新增快捷入口'"
      :show-footer="false"
    >
      <ElForm :model="form" label-width="90px">
        <ElFormItem label="名称" required>
          <ElInput v-model="form.name" />
        </ElFormItem>
        <ElFormItem label="图标" required>
          <ElInput v-model="form.icon" placeholder="如 ri:apps-line" />
        </ElFormItem>
        <ElFormItem label="排序">
          <ElInputNumber v-model="form.sort" :min="0" />
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
    ElForm,
    ElFormItem,
    ElInput,
    ElInputNumber,
    ElMessage,
    ElMessageBox
  } from 'element-plus'
  import { contentApi } from '@/api/business'
  import type { BizId } from '@/types/business'
  import { BizModal, BizTable } from '@/components/biz'
  import type { BizRowAction, BizTableColumn } from '@/components/biz/BizTable.vue'

  interface QuickEntryRow {
    id: BizId
    name: string
    icon: string
    sort: number
  }

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)
  const currentId = ref<BizId | null>(null)

  const form = reactive<QuickEntryRow>({
    id: '',
    name: '',
    icon: '',
    sort: 1
  })

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'name', label: '名称', minWidth: 180 },
    { prop: 'icon', label: '图标', minWidth: 180 },
    { prop: 'sort', label: '排序', width: 100, align: 'right' }
  ]

  function onCreate() {
    editing.value = false
    currentId.value = null
    Object.assign(form, { id: '', name: '', icon: '', sort: 1 })
    editVisible.value = true
  }

  const rowActions: BizRowAction[] = [
    {
      label: '编辑',
      type: 'primary',
      onClick: (row) => {
        const item = row as unknown as QuickEntryRow
        editing.value = true
        currentId.value = item.id
        Object.assign(form, item)
        editVisible.value = true
      }
    },
    {
      label: '删除',
      type: 'danger',
      onClick: async (row) => {
        const item = row as unknown as QuickEntryRow
        await ElMessageBox.confirm(`确认删除快捷入口「${item.name}」?`, '提示', { type: 'warning' })
        await contentApi.quickEntryDelete(item.id)
        ElMessage.success('已删除')
        tableRef.value?.reload()
      }
    }
  ]

  async function onSave() {
    if (!form.name || !form.icon) {
      ElMessage.warning('请完整填写')
      return
    }
    loading.value = true
    try {
      if (editing.value && currentId.value) {
        await contentApi.quickEntrySave({ ...form, id: currentId.value })
      } else {
        await contentApi.quickEntrySave(form)
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

  async function fetchList() {
    const rows = await contentApi.quickEntryList()
    return {
      records: rows as unknown as Record<string, unknown>[],
      total: rows.length,
      page: 1,
      pageSize: rows.length || 20
    }
  }
</script>

<style scoped lang="scss">
  .biz-content-quick-entry {
    padding: 12px;
  }
</style>
