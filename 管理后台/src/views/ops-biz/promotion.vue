<!--
  P8 营销活动（V8.24）
  - 满减 / 折扣 / 拼单 / 邀请 / 新客
-->
<template>
  <div class="biz-ops-promotion">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #cell-enabled="{ row }">
        <ElSwitch :model-value="rowEnabled(row)" @change="(v) => onToggle(row, !!v)" />
      </template>
    </BizTable>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElSwitch, ElMessage } from 'element-plus'
  import { opsApi } from '@/api/business'
  import type { BizPromotion, BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '活动名' },
    {
      type: 'select' as const,
      field: 'type',
      label: '类型',
      options: [
        { value: 'fullCut', label: '满减' },
        { value: 'discount', label: '折扣' },
        { value: 'group', label: '拼单' },
        { value: 'invite', label: '邀请' },
        { value: 'newUser', label: '新客' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'name', label: '活动名', minWidth: 180 },
    { prop: 'type', label: '类型', width: 100 },
    {
      prop: 'startAt',
      label: '开始',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    },
    {
      prop: 'endAt',
      label: '结束',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    },
    { prop: 'enabled', label: '启用', width: 90, slot: 'cell-enabled' }
  ]

  function rowEnabled(row: unknown): boolean {
    return !!(row as { enabled?: boolean })?.enabled
  }

  async function onToggle(row: unknown, v: boolean) {
    const p = row as unknown as BizPromotion
    try {
      await opsApi.promotionToggle(p.id, v)
      ElMessage.success(v ? '已启用' : '已停用')
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    }
  }

  const rowActions: BizRowAction[] = [
    {
      label: '编辑',
      type: 'primary',
      onClick: () =>
        ElMessage.info('编辑表单：满减/折扣 阶梯规则配置（业务详细字段较多，建议详情页实现）')
    }
  ]

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      type: params.type
    }
    const resp = await opsApi.promotionList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-ops-promotion {
    padding: 12px;
  }
</style>
