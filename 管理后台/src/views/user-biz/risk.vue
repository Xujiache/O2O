<!--
  P8 用户风控（V8.7：黑名单）
  - 黑名单列表 + 添加 / 移除
-->
<template>
  <div class="biz-user-risk">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #cell-mobile="{ row }">
        <span>{{ maskMobile(rowMobile(row)) }}</span>
      </template>
    </BizTable>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { userApi } from '@/api/business'
  import type { BizUser, BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { maskMobile, fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '昵称 / 手机号' },
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
    { prop: 'nickname', label: '昵称', minWidth: 120 },
    { prop: 'mobile', label: '手机号', width: 140, slot: 'cell-mobile' },
    { prop: 'riskLevel', label: '风险等级', width: 110, statusType: 'RISK_LEVEL' },
    {
      prop: 'createdAt',
      label: '加入时间',
      width: 180,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rowActions: BizRowAction[] = [
    {
      label: '移除黑名单',
      type: 'danger',
      onClick: async (row) => {
        const u = row as unknown as BizUser
        await ElMessageBox.confirm(`确认将 ${u.nickname} 移出黑名单?`, '提示', { type: 'warning' })
        await userApi.removeBlack(u.id)
        ElMessage.success('已移除')
        tableRef.value?.reload()
      }
    }
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
    const resp = await userApi.riskList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-user-risk {
    padding: 12px;
  }
</style>
