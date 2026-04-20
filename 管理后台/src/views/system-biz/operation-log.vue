<!--
  P8 操作日志（V8.46 R1 补齐）
  - traceId 搜索 + 管理员/模块/操作筛选
  - BizTable 列表展示
-->
<template>
  <div class="biz-system-operation-log">
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
      placeholder: 'traceId / 管理员 / 目标'
    },
    {
      type: 'select' as const,
      field: 'module',
      label: '模块',
      options: [
        { value: 'order', label: '订单' },
        { value: 'merchant', label: '商户' },
        { value: 'finance', label: '财务' },
        { value: 'system', label: '系统' },
        { value: 'rider', label: '骑手' },
        { value: 'shop', label: '店铺' },
        { value: 'dispatch', label: '派单' },
        { value: 'marketing', label: '营销' }
      ]
    },
    {
      type: 'select' as const,
      field: 'action',
      label: '操作',
      options: [
        { value: 'create', label: '创建' },
        { value: 'update', label: '更新' },
        { value: 'delete', label: '删除' },
        { value: 'audit', label: '审核' },
        { value: 'export', label: '导出' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'traceId', label: 'Trace ID', width: 220 },
    { prop: 'adminUsername', label: '操作人', width: 120 },
    { prop: 'module', label: '模块', width: 100 },
    { prop: 'action', label: '操作', width: 100 },
    { prop: 'target', label: '目标', minWidth: 160 },
    { prop: 'ip', label: 'IP', width: 140 },
    {
      prop: 'status',
      label: '状态',
      width: 80,
      align: 'center',
      formatter: (_r, _c, v) => (v === 200 ? '成功' : '失败')
    },
    { prop: 'errorMsg', label: '错误信息', minWidth: 160 },
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
      module: params.module,
      action: params.action
    }
    const resp = await systemApi.operationLogList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-system-operation-log {
    padding: 12px;
  }
</style>
