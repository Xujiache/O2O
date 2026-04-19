<!--
  P8 骑手风控
-->
<template>
  <div class="biz-rider-risk">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
    >
      <template #cell-mobile="{ row }">{{ maskMobile(rowMobile(row)) }}</template>
    </BizTable>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { riderApi } from '@/api/business'
  import type { BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'
  import { maskMobile } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '姓名 / 手机' },
    {
      type: 'select' as const,
      field: 'level',
      label: '风险等级',
      options: [
        { value: 1, label: '中风险' },
        { value: 2, label: '高风险' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'realName', label: '姓名', width: 100 },
    { prop: 'mobile', label: '手机', width: 140, slot: 'cell-mobile' },
    { prop: 'cityName', label: '城市', width: 80 },
    { prop: 'riskLevel', label: '风险等级', width: 110, statusType: 'RISK_LEVEL' }
  ]

  function rowMobile(row: unknown): string {
    return (row as { mobile?: string })?.mobile || ''
  }

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      level: params.level
    }
    const resp = await riderApi.riskList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-rider-risk {
    padding: 12px;
  }
</style>
