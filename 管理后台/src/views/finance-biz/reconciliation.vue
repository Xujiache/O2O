<!--
  P8 对账（V8.31 + 导出 Excel）
-->
<template>
  <div class="biz-finance-reconciliation">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :export-config="exportConfig"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { financeApi } from '@/api/business'
  import type { BizSettlementRecord, BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'
  import { formatAmount, fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '订单号' },
    { type: 'dateRange' as const, field: 'range', label: '日期' }
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
      formatter: (_r, _c, v) => (v === 2 ? '正常' : v === 3 ? '差异' : '处理中')
    },
    { prop: 'errorMsg', label: '差异说明', minWidth: 160 },
    {
      prop: 'createdAt',
      label: '时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      startTime: Array.isArray(params.range) ? (params.range[0] as string) : undefined,
      endTime: Array.isArray(params.range) ? (params.range[1] as string) : undefined
    }
    const resp = await financeApi.reconciliationList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }

  async function syncFetch(): Promise<Record<string, unknown>[]> {
    const all = await financeApi.reconciliationList({ page: 1, pageSize: 9999 })
    return all.records.map((r: BizSettlementRecord) => ({
      id: r.id,
      订单号: r.orderNo,
      总额: r.total,
      平台: r.platformAmount,
      商户: r.merchantAmount,
      骑手: r.riderAmount,
      状态: r.status === 2 ? '正常' : '差异',
      差异说明: r.errorMsg
    }))
  }
  const exportConfig = { name: '对账', module: 'reconciliation', syncFetch }
</script>

<style scoped lang="scss">
  .biz-finance-reconciliation {
    padding: 12px;
  }
</style>
