<!--
  P8 账单（V8.31 + 导出 Excel）
-->
<template>
  <div class="biz-finance-bill">
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
  import type { BizBill, BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'
  import { formatAmount } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '账户名' },
    {
      type: 'select' as const,
      field: 'ownerType',
      label: '类型',
      options: [
        { value: 'merchant', label: '商户' },
        { value: 'rider', label: '骑手' }
      ]
    },
    { type: 'dateRange' as const, field: 'range', label: '日期' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'ownerName', label: '账户', minWidth: 140 },
    { prop: 'ownerType', label: '类型', width: 100 },
    { prop: 'date', label: '日期', width: 120 },
    {
      prop: 'totalIncome',
      label: '收入',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'totalSpend',
      label: '支出',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'net',
      label: '净额',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    }
  ]

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      ownerType: params.ownerType,
      startTime: Array.isArray(params.range) ? (params.range[0] as string) : undefined,
      endTime: Array.isArray(params.range) ? (params.range[1] as string) : undefined
    }
    const resp = await financeApi.billList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }

  async function syncFetch(): Promise<Record<string, unknown>[]> {
    const all = await financeApi.billList({ page: 1, pageSize: 9999 })
    return all.records.map((b: BizBill) => ({
      id: b.id,
      账户: b.ownerName,
      类型: b.ownerType,
      日期: b.date,
      收入: b.totalIncome,
      支出: b.totalSpend,
      净额: b.net
    }))
  }
  const exportConfig = { name: '账单', module: 'bill', syncFetch }
</script>

<style scoped lang="scss">
  .biz-finance-bill {
    padding: 12px;
  }
</style>
