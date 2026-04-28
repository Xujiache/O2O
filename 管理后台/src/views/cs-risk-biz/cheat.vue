<!--
  P8 刷单/套现识别
-->
<template>
  <div class="biz-risk-cheat">
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
  import { ElMessage } from 'element-plus'
  import { riskApi } from '@/api/business'
  import type { BizCheatRecord, BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizRowAction, BizTableColumn } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '对象 / 类别' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'targetType', label: '对象类型', width: 100 },
    { prop: 'targetName', label: '对象名称', minWidth: 180 },
    { prop: 'category', label: '类别', width: 120 },
    { prop: 'score', label: '风险分', width: 90, align: 'right' },
    { prop: 'status', label: '状态', width: 100 },
    {
      prop: 'createdAt',
      label: '创建时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rowActions: BizRowAction[] = [
    {
      label: '处罚',
      type: 'danger',
      onClick: async (row) => {
        const item = row as unknown as BizCheatRecord
        await riskApi.cheatPunish(item.id, 'punish')
        ElMessage.success('已处罚')
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
    const resp = await riskApi.cheatList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-risk-cheat {
    padding: 12px;
  }
</style>
