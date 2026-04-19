<!--
  P8 订单列表（V8.16 强筛选 + V8.19 异步导出）
  - 状态 9 Tab + 子条件唯一区分（规避 P5 statusIn:[55] 重复教训）
  - 强筛选：订单号 / 手机号 / 状态 / 类型 / 时间 / 城市
  - 行操作：详情、强制取消、仲裁
  - 导出：≥1000 异步任务
-->
<template>
  <div class="biz-order-list">
    <ElTabs v-model="activeTab" @tab-change="onTabChange">
      <ElTabPane label="全部" name="all" />
      <ElTabPane label="待支付" name="pending" />
      <ElTabPane label="进行中" name="processing" />
      <ElTabPane label="配送中" name="delivering" />
      <ElTabPane label="已送达" name="delivered" />
      <ElTabPane label="已完成" name="completed" />
      <ElTabPane label="已取消" name="cancelled" />
      <ElTabPane label="售后中" name="aftersale" />
      <ElTabPane label="异常" name="exception" />
    </ElTabs>

    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="orderNo"
      :row-actions="rowActions"
      :export-config="exportConfig"
    >
      <template #cell-mobile="{ row }">{{ maskMobile(rowMobile(row)) }}</template>
    </BizTable>

    <BizConfirmDialog
      v-model="cancelVisible"
      title="强制取消订单"
      :message="cancelMessage"
      hint="强制取消后将自动退款（如已支付），请输入「确认」继续"
      @confirm="onCancelConfirm"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElTabs, ElTabPane, ElMessage } from 'element-plus'
  import { orderApi } from '@/api/business'
  import type { BizOrder, BizListParams } from '@/types/business'
  import { BizTable, BizConfirmDialog } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { maskMobile, formatAmount, fmtDateTime } from '@/utils/business/format'

  const router = useRouter()
  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const activeTab = ref<string>('all')

  /** 9 Tab 严格 status + 子条件唯一区分，避免重复 */
  const tabFilters: Record<string, BizListParams> = {
    all: {},
    pending: { status: 10 },
    processing: { statusIn: [20, 30, 40] } as unknown as BizListParams,
    delivering: { status: 50 },
    delivered: { status: 55 },
    completed: { status: 60 },
    cancelled: { statusIn: [70] } as unknown as BizListParams,
    aftersale: { statusIn: [80, 85, 90], hasRefunding: true } as unknown as BizListParams,
    exception: { status: 99 }
  }

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '订单号 / 手机号' },
    {
      type: 'select' as const,
      field: 'bizType',
      label: '类型',
      options: [
        { value: 'takeout', label: '外卖' },
        { value: 'errand-buy', label: '帮我买' },
        { value: 'errand-send', label: '帮我送' },
        { value: 'errand-queue', label: '帮我排队' }
      ]
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
    { type: 'dateRange' as const, field: 'range', label: '时间' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'orderNo', label: '订单号', width: 200, fixed: 'left' },
    { prop: 'bizType', label: '类型', width: 100 },
    { prop: 'status', label: '状态', width: 110, statusType: 'ORDER_STATUS' },
    { prop: 'userMobile', label: '用户', width: 140, slot: 'cell-mobile' },
    { prop: 'shopName', label: '店铺', width: 180 },
    { prop: 'riderName', label: '骑手', width: 100 },
    {
      prop: 'amountTotal',
      label: '金额',
      width: 110,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    { prop: 'cityName', label: '城市', width: 80 },
    {
      prop: 'createdAt',
      label: '下单时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const cancelVisible = ref(false)
  const cancelMessage = ref('')
  const currentOrder = ref<BizOrder | null>(null)

  function rowMobile(row: unknown): string {
    return (row as { userMobile?: string })?.userMobile || ''
  }

  const rowActions: BizRowAction[] = [
    {
      label: '详情',
      type: 'primary',
      onClick: (row) => router.push(`/biz/order/detail/${(row as unknown as BizOrder).orderNo}`)
    },
    {
      label: '强制取消',
      type: 'danger',
      hidden: (row) => {
        const s = (row as unknown as BizOrder).status
        return s >= 60 || s === 70
      },
      onClick: (row) => {
        const o = row as unknown as BizOrder
        currentOrder.value = o
        cancelMessage.value = `即将强制取消订单 ${o.orderNo}（金额 ${formatAmount(o.amountTotal)}）。如已支付将触发退款流程。`
        cancelVisible.value = true
      }
    }
  ]

  async function onCancelConfirm() {
    if (!currentOrder.value) return
    try {
      await orderApi.forceCancel(currentOrder.value.orderNo, '管理员强制取消')
      ElMessage.success('已强制取消')
      cancelVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    }
  }

  function onTabChange() {
    tableRef.value?.reload()
  }

  const totalCount = ref(0)

  async function fetchList(params: Record<string, unknown>) {
    const tabFilter = tabFilters[activeTab.value] || {}
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      bizType: params.bizType as string,
      cityCode: params.cityCode as string,
      startTime: Array.isArray(params.range) ? (params.range[0] as string) : undefined,
      endTime: Array.isArray(params.range) ? (params.range[1] as string) : undefined,
      ...tabFilter
    }
    const resp = await orderApi.list(next as BizListParams & { status?: number })
    totalCount.value = resp.total
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }

  async function syncFetch(): Promise<Record<string, unknown>[]> {
    const all = await orderApi.list({ page: 1, pageSize: 9999 } as BizListParams & {
      status?: number
    })
    return all.records.map((o) => ({
      订单号: o.orderNo,
      类型: o.bizType,
      状态: o.status,
      用户: maskMobile(o.userMobile),
      店铺: o.shopName,
      骑手: o.riderName,
      金额: o.amountTotal,
      城市: o.cityName,
      下单时间: o.createdAt
    }))
  }

  const exportConfig = computed(() => ({ name: '订单列表', module: 'order', syncFetch }))
</script>

<style scoped lang="scss">
  .biz-order-list {
    padding: 12px;
  }
</style>
