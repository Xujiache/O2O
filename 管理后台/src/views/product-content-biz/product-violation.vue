<!--
  P8 违规商品（V8.20 强制下架）
-->
<template>
  <div class="biz-product-violation">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />

    <BizConfirmDialog
      v-model="offlineVisible"
      title="强制下架"
      :message="offlineMessage"
      hint="强制下架后商户端立即下架，且通知商户。请输入「确认」继续"
      @confirm="onOfflineConfirm"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { productApi } from '@/api/business'
  import type { BizProduct, BizListParams } from '@/types/business'
  import { BizTable, BizConfirmDialog } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { formatAmount } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '商品名 / 店铺' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'name', label: '商品名', minWidth: 180 },
    { prop: 'shopName', label: '店铺', minWidth: 160 },
    {
      prop: 'price',
      label: '价格',
      width: 100,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'violationStatus',
      label: '违规等级',
      width: 110,
      statusType: 'PRODUCT_VIOLATION_STATUS'
    },
    { prop: 'status', label: '状态', width: 100, statusType: 'PRODUCT_STATUS' }
  ]

  const offlineVisible = ref(false)
  const offlineMessage = ref('')
  const currentProduct = ref<BizProduct | null>(null)

  const rowActions: BizRowAction[] = [
    {
      label: '强制下架',
      type: 'danger',
      hidden: (row) => (row as unknown as BizProduct).status === 0,
      onClick: (row) => {
        const p = row as unknown as BizProduct
        currentProduct.value = p
        offlineMessage.value = `即将强制下架商品「${p.name}」，操作后立即生效。`
        offlineVisible.value = true
      }
    }
  ]

  async function onOfflineConfirm() {
    if (!currentProduct.value) return
    try {
      await productApi.forceOffline(currentProduct.value.id, '违规商品强制下架')
      ElMessage.success('已下架')
      offlineVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    }
  }

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string
    }
    const resp = await productApi.violationList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-product-violation {
    padding: 12px;
  }
</style>
