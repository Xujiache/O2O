<!--
  P8 店铺列表（V8.9）
  - 列：id / 店铺名 / 城市 / 地址 / 状态
  - 行操作：编辑配送范围（PolygonEditor）
-->
<template>
  <div class="biz-shop-list">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
      :export-config="exportConfig"
    />

    <BizModal
      v-model="rangeVisible"
      title="编辑配送范围"
      width="900px"
      :show-footer="false"
      destroy-on-close
    >
      <BizPolygonEditor v-if="rangeVisible" v-model="rangePoints" :center="rangeCenter" />
      <template #footer>
        <ElButton @click="rangeVisible = false">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="rangePoints.length < 3"
          :loading="rangeLoading"
          @click="onSaveRange"
        >
          保存
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElMessage, ElButton } from 'element-plus'
  import { shopApi } from '@/api/business'
  import type { BizShop, BizListParams } from '@/types/business'
  import { BizTable, BizModal, BizPolygonEditor } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '店铺名 / 地址' },
    {
      type: 'select' as const,
      field: 'cityCode',
      label: '城市',
      options: [
        { value: '110100', label: '北京' },
        { value: '310100', label: '上海' },
        { value: '440100', label: '广州' }
      ]
    },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: '休息中' },
        { value: 1, label: '营业中' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'name', label: '店铺名', minWidth: 200 },
    { prop: 'cityName', label: '城市', width: 80 },
    { prop: 'address', label: '地址', minWidth: 200 },
    { prop: 'status', label: '状态', width: 100, statusType: 'MERCHANT_BIZ_STATUS' }
  ]

  const rangeVisible = ref(false)
  const rangePoints = ref<Array<{ lng: number; lat: number }>>([])
  const rangeCenter = ref({ lng: 116.397428, lat: 39.90923 })
  const rangeLoading = ref(false)
  const currentShop = ref<BizShop | null>(null)

  const rowActions: BizRowAction[] = [
    {
      label: '编辑配送范围',
      type: 'primary',
      onClick: (row) => {
        const s = row as unknown as BizShop
        currentShop.value = s
        rangePoints.value = s.deliveryRange ? [...s.deliveryRange] : []
        rangeVisible.value = true
      }
    }
  ]

  async function onSaveRange() {
    if (!currentShop.value) return
    if (rangePoints.value.length < 3) {
      ElMessage.warning('至少 3 个顶点')
      return
    }
    rangeLoading.value = true
    try {
      await shopApi.updateDeliveryRange(currentShop.value.id, rangePoints.value)
      ElMessage.success('已保存')
      rangeVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
    } finally {
      rangeLoading.value = false
    }
  }

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      cityCode: params.cityCode as string,
      status: params.status
    }
    const resp = await shopApi.list(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }

  async function syncFetch(): Promise<Record<string, unknown>[]> {
    const all = await shopApi.list({ page: 1, pageSize: 9999 })
    return all.records.map((s) => ({
      id: s.id,
      店铺名: s.name,
      城市: s.cityName,
      地址: s.address,
      状态: s.status === 1 ? '营业中' : '休息中'
    }))
  }

  const exportConfig = { name: '店铺列表', module: 'shop', syncFetch }
</script>

<style scoped lang="scss">
  .biz-shop-list {
    padding: 12px;
  }
</style>
