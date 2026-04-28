<!--
  P8 API 日志
  - 列表查询
-->
<template>
  <div class="biz-system-api-log">
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
  import { systemApi } from '@/api/business'
  import type { BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    {
      type: 'input' as const,
      field: 'keyword',
      label: '关键词',
      placeholder: 'traceId / path / IP'
    },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 200, label: '成功' },
        { value: 500, label: '失败' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'traceId', label: 'Trace ID', width: 220 },
    { prop: 'path', label: '路径', minWidth: 220 },
    { prop: 'method', label: '方法', width: 90 },
    { prop: 'status', label: '状态', width: 90, align: 'center' },
    { prop: 'costMs', label: '耗时(ms)', width: 110, align: 'right' },
    { prop: 'ip', label: 'IP', width: 150 },
    { prop: 'errorMsg', label: '错误信息', minWidth: 180 },
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
      status: params.status
    }
    const resp = await systemApi.apiLogList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-system-api-log {
    padding: 12px;
  }
</style>
