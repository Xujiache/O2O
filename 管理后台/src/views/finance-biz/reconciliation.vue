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
  import { financeApi, type BizReconciliationRecord } from '@/api/business/finance'
  import type { BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'
  import { formatAmount, fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    {
      type: 'select' as const,
      field: 'channel',
      label: '渠道',
      options: [
        { value: 'wxpay', label: '微信支付' },
        { value: 'alipay', label: '支付宝' }
      ]
    },
    { type: 'date' as const, field: 'billDate', label: '账单日' },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 1, label: '已对平' },
        { value: 2, label: '有差异' },
        { value: 3, label: '处理中' },
        { value: 4, label: '已处理' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'reconNo', label: '对账单号', width: 200 },
    { prop: 'channel', label: '渠道', width: 100 },
    { prop: 'billDate', label: '账单日', width: 120 },
    { prop: 'totalOrders', label: '平台单数', width: 100, align: 'right' },
    {
      prop: 'totalAmount',
      label: '平台金额',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    { prop: 'channelOrders', label: '渠道单数', width: 100, align: 'right' },
    {
      prop: 'channelAmount',
      label: '渠道金额',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    { prop: 'diffCount', label: '差异笔数', width: 100, align: 'right' },
    {
      prop: 'diffAmount',
      label: '差异金额',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      formatter: (_r, _c, v) =>
        v === 1 ? '已对平' : v === 2 ? '有差异' : v === 3 ? '处理中' : '已处理'
    },
    {
      prop: 'createdAt',
      label: '创建时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams & { channel?: string; billDate?: string; status?: number } = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      channel: params.channel as string,
      billDate: params.billDate as string,
      status: params.status as number | undefined
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
    return all.records.map((r: BizReconciliationRecord) => ({
      id: r.id,
      对账单号: r.reconNo,
      渠道: r.channel,
      账单日: r.billDate,
      平台单数: r.totalOrders,
      平台金额: r.totalAmount,
      渠道单数: r.channelOrders,
      渠道金额: r.channelAmount,
      差异笔数: r.diffCount,
      差异金额: r.diffAmount,
      状态:
        r.status === 1 ? '已对平' : r.status === 2 ? '有差异' : r.status === 3 ? '处理中' : '已处理'
    }))
  }
  const exportConfig = { name: '对账', module: 'reconciliation', syncFetch }
</script>

<style scoped lang="scss">
  .biz-finance-reconciliation {
    padding: 12px;
  }
</style>
