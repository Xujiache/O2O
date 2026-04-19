<!--
  P8 订单投诉
-->
<template>
  <div class="biz-order-complaint">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />

    <BizModal v-model="processVisible" title="处理投诉" :show-footer="false">
      <ElForm :model="processForm" label-width="100px">
        <ElFormItem label="处理结果" required>
          <ElInput v-model="processForm.remark" type="textarea" :rows="4" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="processVisible = false">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="!processForm.remark"
          :loading="loading"
          @click="onProcess"
        >
          确认
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElMessageBox } from 'element-plus'
  import { orderApi } from '@/api/business'
  import type { BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  interface ComplaintRow {
    id: number | string
    orderNo?: string
    reporter: string
    category: string
    content: string
    status: 0 | 1 | 2 | 3
    createdAt: string
  }

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '订单号 / 投诉人' },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: '待处理' },
        { value: 1, label: '处理中' },
        { value: 2, label: '已处理' },
        { value: 3, label: '已关闭' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'orderNo', label: '订单号', width: 200 },
    { prop: 'reporter', label: '投诉人', width: 120 },
    { prop: 'category', label: '分类', width: 120 },
    { prop: 'content', label: '内容', minWidth: 200 },
    { prop: 'status', label: '状态', width: 100, statusType: 'COMPLAINT_STATUS' },
    {
      prop: 'createdAt',
      label: '时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const processVisible = ref(false)
  const loading = ref(false)
  const currentRow = ref<ComplaintRow | null>(null)
  const processForm = reactive({ remark: '' })

  const rowActions: BizRowAction[] = [
    {
      label: '处理',
      type: 'primary',
      hidden: (row) => (row as unknown as ComplaintRow).status >= 2,
      onClick: (row) => {
        currentRow.value = row as unknown as ComplaintRow
        processForm.remark = ''
        processVisible.value = true
      }
    },
    {
      label: '关闭',
      type: 'danger',
      hidden: (row) => (row as unknown as ComplaintRow).status >= 2,
      onClick: async (row) => {
        const r = row as unknown as ComplaintRow
        await ElMessageBox.confirm(`确认关闭投诉 #${r.id}?`, '提示', { type: 'warning' })
        await orderApi.complaintHandle(r.id, 'close')
        ElMessage.success('已关闭')
        tableRef.value?.reload()
      }
    }
  ]

  async function onProcess() {
    if (!currentRow.value || !processForm.remark) return
    loading.value = true
    try {
      await orderApi.complaintHandle(currentRow.value.id, 'process', processForm.remark)
      ElMessage.success('已处理')
      processVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    } finally {
      loading.value = false
    }
  }

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      status: params.status
    }
    const resp = await orderApi.complaintList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-order-complaint {
    padding: 12px;
  }
</style>
