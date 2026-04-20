<!--
  P8 分账记录（V8.29 异常单可重跑）
-->
<template>
  <div class="biz-finance-settlement-record">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { financeApi } from '@/api/business'
  import type { BizSettlementRecord, BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { formatAmount, fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '订单号' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'orderNo', label: '订单号', width: 200 },
    {
      prop: 'total',
      label: '总额',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'platformAmount',
      label: '平台',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'merchantAmount',
      label: '商户',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'riderAmount',
      label: '骑手',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      formatter: (_r, _c, v) => (v === 2 ? '成功' : v === 3 ? '失败' : '处理中')
    },
    { prop: 'errorMsg', label: '错误', minWidth: 160 },
    {
      prop: 'createdAt',
      label: '时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rowActions: BizRowAction[] = [
    {
      label: '重跑',
      type: 'warning',
      hidden: (row) => (row as unknown as BizSettlementRecord).status !== 3,
      onClick: async (row) => {
        const r = row as unknown as BizSettlementRecord
        await ElMessageBox.confirm(`确认重跑订单 ${r.orderNo} 的分账?`, '提示', { type: 'warning' })
        await financeApi.settlementRecordRetry(r.id)
        ElMessage.success('已加入重跑队列')
        tableRef.value?.reload()
      }
    }
  ]

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string
    }
    const resp = await financeApi.settlementRecordList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-finance-settlement-record {
    padding: 12px;
  }
</style>
