<!--
  P8 骑手转单审核
-->
<template>
  <div class="biz-rider-transfer-audit">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />

    <BizModal v-model="rejectVisible" title="驳回转单" :show-footer="false">
      <ElForm :model="rejectForm" label-width="80px">
        <ElFormItem label="驳回原因" required>
          <ElInput v-model="rejectForm.reason" type="textarea" :rows="4" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="rejectVisible = false">取消</ElButton>
        <ElButton type="danger" :disabled="!rejectForm.reason" :loading="loading" @click="onReject">
          确认驳回
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import { ElMessage, ElMessageBox, ElForm, ElFormItem, ElInput, ElButton } from 'element-plus'
  import { riderApi } from '@/api/business'
  import type { BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  interface TransferRow {
    id: number | string
    orderNo: string
    fromRiderName: string
    toRiderName: string
    reason: string
    status: 0 | 1 | 2
    createdAt: string
  }

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '订单号 / 骑手' },
    {
      type: 'select' as const,
      field: 'status',
      label: '审核状态',
      options: [
        { value: 0, label: '待审核' },
        { value: 1, label: '已通过' },
        { value: 2, label: '已驳回' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'orderNo', label: '订单号', width: 200, tooltip: true },
    { prop: 'fromRiderName', label: '原骑手', width: 120 },
    { prop: 'toRiderName', label: '目标骑手', width: 120 },
    { prop: 'reason', label: '原因', minWidth: 180 },
    { prop: 'status', label: '状态', width: 100, statusType: 'TRANSFER_AUDIT_STATUS' },
    {
      prop: 'createdAt',
      label: '提交时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rejectVisible = ref(false)
  const loading = ref(false)
  const currentRow = ref<TransferRow | null>(null)
  const rejectForm = reactive({ reason: '' })

  const rowActions: BizRowAction[] = [
    {
      label: '通过',
      type: 'success',
      hidden: (row) => (row as unknown as TransferRow).status !== 0,
      onClick: async (row) => {
        const r = row as unknown as TransferRow
        await ElMessageBox.confirm(`确认通过 ${r.orderNo} 的转单?`, '提示', { type: 'success' })
        await riderApi.transferPass(r.id)
        ElMessage.success('已通过')
        tableRef.value?.reload()
      }
    },
    {
      label: '驳回',
      type: 'danger',
      hidden: (row) => (row as unknown as TransferRow).status !== 0,
      onClick: (row) => {
        currentRow.value = row as unknown as TransferRow
        rejectForm.reason = ''
        rejectVisible.value = true
      }
    }
  ]

  async function onReject() {
    if (!currentRow.value || !rejectForm.reason) return
    loading.value = true
    try {
      await riderApi.transferReject(currentRow.value.id, rejectForm.reason)
      ElMessage.success('已驳回')
      rejectVisible.value = false
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
    const resp = await riderApi.transferAuditList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-rider-transfer-audit {
    padding: 12px;
  }
</style>
