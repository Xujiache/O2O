<!--
  P8 商户风控（V8.11）
  - 违规 / 差评 / 投诉台账
-->
<template>
  <div class="biz-merchant-risk">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { merchantApi } from '@/api/business'
  import type { BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '商户名 / 联系人' },
    {
      type: 'select' as const,
      field: 'level',
      label: '风险等级',
      options: [
        { value: 0, label: '低' },
        { value: 1, label: '中' },
        { value: 2, label: '高' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'name', label: '商户名', minWidth: 160 },
    { prop: 'cityName', label: '城市', width: 80 },
    { prop: 'shopCount', label: '店铺数', width: 80 },
    { prop: 'riskLevel', label: '风险等级', width: 110, statusType: 'RISK_LEVEL' },
    {
      prop: 'createdAt',
      label: '入驻时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      level: params.level
    }
    const resp = await merchantApi.riskList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-merchant-risk {
    padding: 12px;
  }
</style>
