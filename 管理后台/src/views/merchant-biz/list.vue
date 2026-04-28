<!--
  P8 商户列表
  - 列：id / 商户名 / 联系人 / 城市 / 店铺数 / 审核状态 / 营业状态
  - 行操作：详情、封禁、解封
-->
<template>
  <div class="biz-merchant-list">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
      :export-config="exportConfig"
    />
    <BizConfirmDialog
      v-model="banVisible"
      title="封禁商户"
      :message="banMessage"
      hint="封禁后该商户旗下所有店铺将下架，请输入「确认」继续"
      @confirm="onBanConfirm"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage } from 'element-plus'
  import { merchantApi } from '@/api/business'
  import type { BizMerchant, BizListParams } from '@/types/business'
  import { BizTable, BizConfirmDialog } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const router = useRouter()
  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    {
      type: 'input' as const,
      field: 'keyword',
      label: '关键词',
      placeholder: '商户名 / 联系人 / 手机'
    },
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
      field: 'bizStatus',
      label: '营业状态',
      options: [
        { value: 0, label: '休息中' },
        { value: 1, label: '营业中' },
        { value: 2, label: '已封禁' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'name', label: '商户名', minWidth: 160 },
    { prop: 'contact', label: '联系人', width: 100 },
    { prop: 'cityName', label: '城市', width: 80 },
    { prop: 'shopCount', label: '店铺数', width: 80, align: 'right' },
    { prop: 'auditStatus', label: '审核', width: 100, statusType: 'MERCHANT_AUDIT_STATUS' },
    { prop: 'bizStatus', label: '营业', width: 100, statusType: 'MERCHANT_BIZ_STATUS' },
    {
      prop: 'createdAt',
      label: '入驻时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const banVisible = ref(false)
  const banMessage = ref('')
  const currentMerchant = ref<BizMerchant | null>(null)

  const rowActions: BizRowAction[] = [
    {
      label: '详情',
      type: 'primary',
      onClick: (row) => router.push(`/biz/merchant/detail/${(row as unknown as BizMerchant).id}`)
    },
    {
      label: '封禁',
      type: 'danger',
      hidden: (row) => (row as unknown as BizMerchant).bizStatus === 2,
      onClick: (row) => {
        const m = row as unknown as BizMerchant
        currentMerchant.value = m
        banMessage.value = `即将封禁商户「${m.name}」，封禁后该商户所有店铺将下架，且无法接单。`
        banVisible.value = true
      }
    },
    {
      label: '解封',
      type: 'success',
      hidden: (row) => (row as unknown as BizMerchant).bizStatus !== 2,
      onClick: async (row) => {
        const m = row as unknown as BizMerchant
        await merchantApi.unban(m.id)
        ElMessage.success('已解封')
        tableRef.value?.reload()
      }
    }
  ]

  async function onBanConfirm() {
    if (!currentMerchant.value) return
    try {
      await merchantApi.ban(currentMerchant.value.id)
      ElMessage.success(`已封禁 ${currentMerchant.value.name}`)
      banVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '封禁失败')
    }
  }

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      cityCode: params.cityCode as string,
      bizStatus: params.bizStatus
    }
    const resp = await merchantApi.list(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }

  async function syncFetch(): Promise<Record<string, unknown>[]> {
    const all = await merchantApi.list({ page: 1, pageSize: 9999 })
    return all.records.map((m) => ({
      id: m.id,
      商户名: m.name,
      联系人: m.contact,
      手机: m.mobile,
      城市: m.cityName,
      店铺数: m.shopCount
    }))
  }

  const exportConfig = { name: '商户列表', module: 'merchant', syncFetch }
</script>

<style scoped lang="scss">
  .biz-merchant-list {
    padding: 12px;
  }
</style>
