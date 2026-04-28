<!--
  P8 风险订单
-->
<template>
  <div class="biz-risk-order">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="orderNo"
      :row-actions="rowActions"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { riskApi } from '@/api/business'
  import type { BizListParams, BizRiskOrder } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizRowAction, BizTableColumn } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '订单号 / 原因' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'orderNo', label: '订单号', width: 180 },
    { prop: 'reason', label: '原因', minWidth: 220 },
    { prop: 'level', label: '等级', width: 80, align: 'center' },
    {
      prop: 'hitRules',
      label: '命中规则',
      minWidth: 220,
      formatter: (_r, _c, v) => (Array.isArray(v) ? (v as string[]).join(' / ') : '-')
    },
    { prop: 'status', label: '状态', width: 100 },
    { prop: 'reviewedBy', label: '审核人', width: 120 },
    {
      prop: 'reviewedAt',
      label: '审核时间',
      width: 170,
      formatter: (_r, _c, v) => (v ? fmtDateTime(v as string) : '-')
    }
  ]

  const rowActions: BizRowAction[] = [
    {
      label: '通过',
      type: 'success',
      onClick: async (row) => {
        const item = row as unknown as BizRiskOrder
        await riskApi.riskOrderReview(item.orderNo, 'pass')
        ElMessage.success('已通过')
        tableRef.value?.reload()
      }
    },
    {
      label: '拦截',
      type: 'danger',
      onClick: async (row) => {
        const item = row as unknown as BizRiskOrder
        await riskApi.riskOrderReview(item.orderNo, 'block')
        ElMessage.success('已拦截')
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
    const resp = await riskApi.riskOrderList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-risk-order {
    padding: 12px;
  }
</style>
