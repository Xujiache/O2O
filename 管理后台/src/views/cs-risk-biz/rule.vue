<!--
  P8 风控规则
-->
<template>
  <div class="biz-risk-rule">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增规则</ElButton>
      </template>
    </BizTable>

    <BizModal v-model="editVisible" :title="editing ? '编辑规则' : '新增规则'" :show-footer="false">
      <ElForm :model="form" label-width="90px">
        <ElFormItem label="规则名" required><ElInput v-model="form.name" /></ElFormItem>
        <ElFormItem label="类别"><ElInput v-model="form.category" /></ElFormItem>
        <ElFormItem label="动作"><ElInput v-model="form.action" /></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="loading" @click="onSave">保存</ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { ElButton, ElForm, ElFormItem, ElInput, ElMessage } from 'element-plus'
  import { riskApi } from '@/api/business'
  import type { BizId, BizListParams, BizRiskRule } from '@/types/business'
  import { BizModal, BizTable } from '@/components/biz'
  import type { BizRowAction, BizTableColumn } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)
  const currentId = ref<BizId | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '规则名 / 类别' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'name', label: '规则名', minWidth: 180 },
    { prop: 'category', label: '类别', width: 120 },
    { prop: 'action', label: '动作', minWidth: 160 },
    {
      prop: 'enabled',
      label: '启用',
      width: 100,
      formatter: (_r, _c, v) => ((v as boolean) ? '启用' : '停用')
    },
    {
      prop: 'createdAt',
      label: '创建时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const form = reactive<Partial<BizRiskRule>>({ name: '', category: '', action: '', enabled: true })

  function onCreate() {
    editing.value = false
    currentId.value = null
    Object.assign(form, { name: '', category: '', action: '', enabled: true })
    editVisible.value = true
  }

  const rowActions: BizRowAction[] = [
    {
      label: '编辑',
      type: 'primary',
      onClick: (row) => {
        const item = row as unknown as BizRiskRule
        editing.value = true
        currentId.value = item.id
        Object.assign(form, item)
        editVisible.value = true
      }
    }
  ]

  async function onSave() {
    if (!form.name) {
      ElMessage.warning('请填写规则名')
      return
    }
    loading.value = true
    try {
      if (editing.value && currentId.value) {
        await riskApi.ruleUpdate(currentId.value, form)
      } else {
        await riskApi.ruleSave(form)
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
    const resp = await riskApi.ruleList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-risk-rule {
    padding: 12px;
  }
</style>
