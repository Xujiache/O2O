<!--
  P8 发票审核
  - 通过 / 驳回 / 上传开票 PDF
-->
<template>
  <div class="biz-finance-invoice-audit">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />

    <BizModal v-model="rejectVisible" title="驳回发票" :show-footer="false">
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

    <BizModal v-model="uploadVisible" title="上传开票 PDF" :show-footer="false">
      <ElForm :model="uploadForm" label-width="80px">
        <ElFormItem label="PDF 链接" required>
          <ElInput v-model="uploadForm.pdfUrl" placeholder="https://..." />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="uploadVisible = false">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="!uploadForm.pdfUrl"
          :loading="loading"
          @click="onUpload"
        >
          确认上传
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElMessageBox } from 'element-plus'
  import { financeApi } from '@/api/business'
  import type { BizInvoice, BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { formatAmount, fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '抬头 / 申请人' },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: '待审核' },
        { value: 1, label: '待开票' },
        { value: 2, label: '已开票' },
        { value: 3, label: '已驳回' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'applicantName', label: '申请人', width: 120 },
    { prop: 'applicantType', label: '类型', width: 80 },
    { prop: 'title', label: '抬头', minWidth: 180 },
    { prop: 'taxNo', label: '税号', width: 200 },
    {
      prop: 'amount',
      label: '金额',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    { prop: 'status', label: '状态', width: 110, statusType: 'INVOICE_STATUS' },
    {
      prop: 'createdAt',
      label: '提交时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rejectVisible = ref(false)
  const uploadVisible = ref(false)
  const loading = ref(false)
  const currentRow = ref<BizInvoice | null>(null)
  const rejectForm = reactive({ reason: '' })
  const uploadForm = reactive({ pdfUrl: '' })

  const rowActions: BizRowAction[] = [
    {
      label: '通过',
      type: 'success',
      hidden: (row) => (row as unknown as BizInvoice).status !== 0,
      onClick: async (row) => {
        const r = row as unknown as BizInvoice
        await ElMessageBox.confirm(`确认通过 ${r.applicantName} 的发票申请?`, '提示', {
          type: 'success'
        })
        await financeApi.invoicePass(r.id)
        ElMessage.success('已通过')
        tableRef.value?.reload()
      }
    },
    {
      label: '驳回',
      type: 'danger',
      hidden: (row) => (row as unknown as BizInvoice).status !== 0,
      onClick: (row) => {
        currentRow.value = row as unknown as BizInvoice
        rejectForm.reason = ''
        rejectVisible.value = true
      }
    },
    {
      label: '上传 PDF',
      type: 'warning',
      hidden: (row) => (row as unknown as BizInvoice).status !== 1,
      onClick: (row) => {
        currentRow.value = row as unknown as BizInvoice
        uploadForm.pdfUrl = ''
        uploadVisible.value = true
      }
    }
  ]

  async function onReject() {
    if (!currentRow.value || !rejectForm.reason) return
    loading.value = true
    try {
      await financeApi.invoiceReject(currentRow.value.id, rejectForm.reason)
      ElMessage.success('已驳回')
      rejectVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    } finally {
      loading.value = false
    }
  }

  async function onUpload() {
    if (!currentRow.value || !uploadForm.pdfUrl) return
    loading.value = true
    try {
      await financeApi.invoiceIssue(currentRow.value.id, uploadForm.pdfUrl)
      ElMessage.success('已上传')
      uploadVisible.value = false
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
    const resp = await financeApi.invoiceList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-finance-invoice-audit {
    padding: 12px;
  }
</style>
