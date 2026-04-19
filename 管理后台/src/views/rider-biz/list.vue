<!--
  P8 骑手列表
  - 列：id / 姓名 / 手机 / 城市 / 等级 / 在线状态 / 今日订单 / 评分
  - 行操作：详情、轨迹回放
-->
<template>
  <div class="biz-rider-list">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
      :export-config="exportConfig"
    >
      <template #cell-mobile="{ row }">{{ maskMobile(rowMobile(row)) }}</template>
      <template #cell-rating="{ row }">{{ formatRating(row) }}</template>
    </BizTable>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { riderApi } from '@/api/business'
  import type { BizRider, BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { maskMobile } from '@/utils/business/format'

  const router = useRouter()
  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '姓名 / 手机' },
    {
      type: 'select' as const,
      field: 'level',
      label: '等级',
      options: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: `Lv.${v}` }))
    },
    {
      type: 'select' as const,
      field: 'onlineStatus',
      label: '在线',
      options: [
        { value: 0, label: '离线' },
        { value: 1, label: '在线-空闲' },
        { value: 2, label: '在线-接单中' },
        { value: 3, label: '在线-配送中' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'realName', label: '姓名', width: 100 },
    { prop: 'mobile', label: '手机', width: 140, slot: 'cell-mobile' },
    { prop: 'cityName', label: '城市', width: 80 },
    { prop: 'level', label: '等级', width: 80, formatter: (_r, _c, v) => `Lv.${v}` },
    { prop: 'onlineStatus', label: '在线状态', width: 130, statusType: 'RIDER_ONLINE_STATUS' },
    { prop: 'todayOrders', label: '今日单数', width: 100, align: 'right' },
    { prop: 'rating', label: '评分', width: 80, align: 'right', slot: 'cell-rating' }
  ]

  function rowMobile(row: unknown): string {
    return (row as { mobile?: string })?.mobile || ''
  }
  function formatRating(row: unknown): string {
    const r = (row as { rating?: number })?.rating
    return r != null ? r.toFixed(1) : '-'
  }

  const rowActions: BizRowAction[] = [
    {
      label: '详情',
      type: 'primary',
      onClick: (row) => router.push(`/biz/rider/detail/${(row as unknown as BizRider).id}`)
    }
  ]

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      level: params.level,
      onlineStatus: params.onlineStatus
    }
    const resp = await riderApi.list(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }

  async function syncFetch(): Promise<Record<string, unknown>[]> {
    const all = await riderApi.list({ page: 1, pageSize: 9999 })
    return all.records.map((r) => ({
      id: r.id,
      姓名: r.realName,
      手机: maskMobile(r.mobile),
      城市: r.cityName,
      等级: `Lv.${r.level}`,
      今日单数: r.todayOrders,
      评分: r.rating?.toFixed(1)
    }))
  }
  const exportConfig = { name: '骑手列表', module: 'rider', syncFetch }
</script>

<style scoped lang="scss">
  .biz-rider-list {
    padding: 12px;
  }
</style>
