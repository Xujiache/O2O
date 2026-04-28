<!--
  P8 热搜词管理
  - 列表 + 新增/编辑 + 删除
-->
<template>
  <div class="biz-content-hot-search">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增热搜词</ElButton>
      </template>
    </BizTable>

    <BizModal
      v-model="editVisible"
      :title="editing ? '编辑热搜词' : '新增热搜词'"
      :show-footer="false"
    >
      <ElForm :model="form" label-width="90px">
        <ElFormItem label="关键词" required>
          <ElInput v-model="form.keyword" />
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

  interface HotSearchRow {
    id: BizId
    keyword: string
    sort: number
  }

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)
  const currentId = ref<BizId | null>(null)

  const form = reactive<HotSearchRow>({
    id: '',
    keyword: '',
    sort: 1
  })

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'keyword', label: '关键词', minWidth: 220 },
    { prop: 'sort', label: '排序', width: 100, align: 'right' }
  ]

  function onCreate() {
    editing.value = false
    currentId.value = null
    Object.assign(form, { id: '', keyword: '', sort: 1 })
    editVisible.value = true
  }

  const rowActions: BizRowAction[] = [
    {
      label: '编辑',
      type: 'primary',
      onClick: (row) => {
        const item = row as unknown as HotSearchRow
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
        const item = row as unknown as HotSearchRow
        await ElMessageBox.confirm(`确认删除热搜词「${item.keyword}」?`, '提示', {
          type: 'warning'
        })
        await contentApi.hotSearchDelete(item.id)
        ElMessage.success('已删除')
        tableRef.value?.reload()
      }
    }
  ]

  async function onSave() {
    if (!form.keyword) {
      ElMessage.warning('请填写关键词')
      return
    }
    loading.value = true
    try {
      if (editing.value && currentId.value) {
        await contentApi.hotSearchSave({ ...form, id: currentId.value })
      } else {
        await contentApi.hotSearchSave(form)
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
    const rows = await contentApi.hotSearchList()
    return {
      records: rows as unknown as Record<string, unknown>[],
      total: rows.length,
      page: 1,
      pageSize: rows.length || 20
    }
  }
</script>

<style scoped lang="scss">
  .biz-content-hot-search {
    padding: 12px;
  }
</style>
