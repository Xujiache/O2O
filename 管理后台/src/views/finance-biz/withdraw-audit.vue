<!--
  P8 提现批量审核（V8.30 关键 + 5 Tab + 批量）
  - 5 Tab 严格区分：待审核 / 审核通过 / 已驳回 / 打款中 / 已打款
  - 批量审核：批量真循环 N 次（规避 P6/I-02 教训）
-->
<template>
  <div class="biz-finance-withdraw-audit">
    <ElTabs v-model="activeTab" @tab-change="onTabChange">
      <ElTabPane label="待审核" name="0" />
      <ElTabPane label="审核通过" name="1" />
      <ElTabPane label="已驳回" name="2" />
      <ElTabPane label="打款中" name="3" />
      <ElTabPane label="已打款" name="4" />
    </ElTabs>

    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
      :batch-actions="batchActions"
    >
      <template #cell-card="{ row }">{{ maskBankCard(rowCard(row)) }}</template>
    </BizTable>

    <BizModal v-model="rejectVisible" title="驳回提现" :show-footer="false">
      <ElForm :model="rejectForm" label-width="80px">
        <ElFormItem label="驳回原因" required>
          <ElInput v-model="rejectForm.reason" type="textarea" :rows="4" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="rejectVisible = false">取消</ElButton>
        <ElButton
          type="danger"
          :disabled="!rejectForm.reason"
          :loading="loading"
          @click="onRejectConfirm"
        >
          确认驳回
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import {
    ElTabs,
    ElTabPane,
    ElForm,
    ElFormItem,
    ElInput,
    ElButton,
    ElMessage,
    ElMessageBox
  } from 'element-plus'
  import { financeApi } from '@/api/business'
  import type { BizWithdraw, BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction, BizBatchAction } from '@/components/biz/BizTable.vue'
  import { maskBankCard, formatAmount, fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const activeTab = ref('0')

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '申请人 / 银行卡' },
    {
      type: 'select' as const,
      field: 'applicantType',
      label: '申请人类型',
      options: [
        { value: 'merchant', label: '商户' },
        { value: 'rider', label: '骑手' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'applicantName', label: '申请人', minWidth: 140 },
    { prop: 'applicantType', label: '类型', width: 100 },
    { prop: 'bankCard', label: '银行卡（脱敏）', width: 200, slot: 'cell-card' },
    { prop: 'bankName', label: '银行', width: 120 },
    {
      prop: 'amount',
      label: '金额',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    { prop: 'status', label: '状态', width: 100, statusType: 'WITHDRAW_STATUS' },
    {
      prop: 'createdAt',
      label: '提交时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rejectVisible = ref(false)
  const loading = ref(false)
  const currentRow = ref<BizWithdraw | null>(null)
  const rejectForm = reactive({ reason: '' })

  function rowCard(row: unknown): string {
    return (row as { bankCard?: string })?.bankCard || ''
  }

  const rowActions: BizRowAction[] = [
    {
      label: '通过',
      type: 'success',
      hidden: (row) => (row as unknown as BizWithdraw).status !== 0,
      onClick: async (row) => {
        const r = row as unknown as BizWithdraw
        await ElMessageBox.confirm(
          `确认通过 ${r.applicantName} 的提现申请（${formatAmount(r.amount)}）?`,
          '提示',
          { type: 'success' }
        )
        await financeApi.withdrawPass(r.id)
        ElMessage.success('已通过')
        tableRef.value?.reload()
      }
    },
    {
      label: '驳回',
      type: 'danger',
      hidden: (row) => (row as unknown as BizWithdraw).status !== 0,
      onClick: (row) => {
        currentRow.value = row as unknown as BizWithdraw
        rejectForm.reason = ''
        rejectVisible.value = true
      }
    }
  ]

  const batchActions: BizBatchAction[] = [
    {
      label: '批量通过',
      type: 'success',
      onClick: async (selected) => {
        const candidates = selected.filter((s) => (s as unknown as BizWithdraw).status === 0)
        if (!candidates.length) {
          ElMessage.warning('没有待审核项')
          return
        }
        await ElMessageBox.confirm(`确认批量通过 ${candidates.length} 笔提现?`, '提示', {
          type: 'success'
        })
        const ids = candidates.map((c) => (c as unknown as BizWithdraw).id)
        const r = await financeApi.withdrawBatchAudit(ids, 'pass')
        ElMessage.success(`成功 ${r.successCount}，失败 ${r.failedCount}`)
        tableRef.value?.reload()
      }
    },
    {
      label: '批量驳回',
      type: 'danger',
      onClick: async (selected) => {
        const candidates = selected.filter((s) => (s as unknown as BizWithdraw).status === 0)
        if (!candidates.length) {
          ElMessage.warning('没有待审核项')
          return
        }
        const { value: reason } = await ElMessageBox.prompt('请输入批量驳回原因', '提示', {
          inputValidator: (v) => (v ? true : '原因必填')
        })
        const ids = candidates.map((c) => (c as unknown as BizWithdraw).id)
        const r = await financeApi.withdrawBatchAudit(ids, 'reject', reason)
        ElMessage.success(`批量驳回完成：成功 ${r.successCount}，失败 ${r.failedCount}`)
        tableRef.value?.reload()
      }
    }
  ]

  async function onRejectConfirm() {
    if (!currentRow.value || !rejectForm.reason) return
    loading.value = true
    try {
      await financeApi.withdrawReject(currentRow.value.id, rejectForm.reason)
      ElMessage.success('已驳回')
      rejectVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    } finally {
      loading.value = false
    }
  }

  function onTabChange() {
    tableRef.value?.reload()
  }

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams & { status?: number } = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      applicantType: params.applicantType,
      status: Number(activeTab.value)
    }
    const resp = await financeApi.withdrawAuditList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-finance-withdraw-audit {
    padding: 12px;
  }
</style>
