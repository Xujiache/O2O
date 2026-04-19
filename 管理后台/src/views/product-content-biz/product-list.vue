<!--
  P8 商品列表
  - 列：id / 封面 / 商品名 / 店铺 / 分类 / 价格 / 库存 / 月销 / 状态 / 违规
-->
<template>
  <div class="biz-product-list">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :export-config="exportConfig"
    >
      <template #cell-cover="{ row }">
        <ElImage
          :src="rowCover(row)"
          fit="cover"
          style="width: 56px; height: 56px; border-radius: 4px"
        />
      </template>
    </BizTable>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElImage } from 'element-plus'
  import { productApi } from '@/api/business'
  import type { BizProduct, BizListParams } from '@/types/business'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'
  import { formatAmount, fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '商品名 / 店铺' },
    {
      type: 'select' as const,
      field: 'status',
      label: '上架状态',
      options: [
        { value: 1, label: '在售' },
        { value: 0, label: '已下架' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'cover', label: '封面', width: 80, slot: 'cell-cover' },
    { prop: 'name', label: '商品名', minWidth: 180 },
    { prop: 'shopName', label: '店铺', minWidth: 160 },
    { prop: 'categoryName', label: '分类', width: 100 },
    {
      prop: 'price',
      label: '价格',
      width: 100,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    { prop: 'stockQty', label: '库存', width: 80, align: 'right' },
    { prop: 'monthlySales', label: '月销', width: 80, align: 'right' },
    { prop: 'status', label: '状态', width: 100, statusType: 'PRODUCT_STATUS' },
    {
      prop: 'violationStatus',
      label: '违规',
      width: 110,
      statusType: 'PRODUCT_VIOLATION_STATUS'
    },
    {
      prop: 'createdAt',
      label: '上架时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  function rowCover(row: unknown): string {
    return (row as { cover?: string })?.cover || ''
  }

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      status: params.status
    }
    const resp = await productApi.list(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }

  async function syncFetch(): Promise<Record<string, unknown>[]> {
    const all = await productApi.list({ page: 1, pageSize: 9999 })
    return all.records.map((p: BizProduct) => ({
      id: p.id,
      商品名: p.name,
      店铺: p.shopName,
      分类: p.categoryName,
      价格: p.price,
      库存: p.stockQty,
      月销: p.monthlySales,
      状态: p.status === 1 ? '在售' : '已下架'
    }))
  }
  const exportConfig = { name: '商品列表', module: 'product', syncFetch }
</script>

<style scoped lang="scss">
  .biz-product-list {
    padding: 12px;
  }
</style>
