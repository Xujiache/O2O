<!--
  P8 违规处理记录
-->
<template>
  <div class="biz-risk-record">
    <BizTable :columns="columns" :search-schema="searchSchema" :fetch="fetchList" row-key="id" />
  </div>
</template>

<script setup lang="ts">
  import { riskApi } from '@/api/business'
  import type { BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '对象 / 类型' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'targetType', label: '对象类型', width: 100 },
    { prop: 'targetName', label: '对象名称', minWidth: 180 },
    { prop: 'category', label: '类别', width: 120 },
    { prop: 'score', label: '分值', width: 90, align: 'right' },
    { prop: 'status', label: '状态', width: 100 },
    {
      prop: 'createdAt',
      label: '创建时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string
    }
    const resp = await riskApi.recordList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-risk-record {
    padding: 12px;
  }
</style>
