<!--
  P8 数据大盘 - 概览（V8.1 + V8.3）
  - 8 张 KPI 卡（实时订单/今日交易额/累计用户/累计商户/在线骑手/配送完成率/待仲裁/待入驻审核）
  - 24 小时订单 + 交易额折线
  - 热门商家 / 商品 Top 10
  - 异常订单实时表（最近 20 条）
  - WS admin:dashboard:tick 5s 刷新
-->
<template>
  <div class="biz-dashboard-overview">
    <ElRow :gutter="12">
      <ElCol v-for="kpi in kpis" :key="kpi.key" :xs="24" :sm="12" :md="6" :lg="6">
        <ElCard shadow="hover" class="biz-kpi-card">
          <div class="biz-kpi-card__title">{{ kpi.title }}</div>
          <div class="biz-kpi-card__value" :style="{ color: kpi.color }">{{ kpi.value }}</div>
          <div class="biz-kpi-card__hint">{{ kpi.hint }}</div>
        </ElCard>
      </ElCol>
    </ElRow>

    <ElRow :gutter="12" style="margin-top: 12px">
      <ElCol :xs="24" :md="16">
        <ElCard shadow="hover">
          <template #header>
            <span>24h 订单趋势</span>
            <span style="float: right; font-size: 12px; color: #909399"
              >WS 实时刷新（5s 节流）</span
            >
          </template>
          <BizChart :option="trendOption" height="320px" />
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :md="8">
        <ElCard shadow="hover">
          <template #header>商品销量 Top 10</template>
          <BizChart :option="topProductsOption" height="320px" />
        </ElCard>
      </ElCol>
    </ElRow>

    <ElRow :gutter="12" style="margin-top: 12px">
      <ElCol :xs="24" :md="12">
        <ElCard shadow="hover">
          <template #header>商家销量 Top 10</template>
          <BizChart :option="topShopsOption" height="280px" />
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :md="12">
        <ElCard shadow="hover">
          <template #header>异常订单（最近 20 条）</template>
          <ElTable :data="anomalyOrders" size="small" max-height="280">
            <ElTableColumn prop="orderNo" label="订单号" width="200" show-overflow-tooltip />
            <ElTableColumn prop="userMobile" label="用户" width="140">
              <template #default="{ row }">{{ maskMobile(row.userMobile) }}</template>
            </ElTableColumn>
            <ElTableColumn label="状态" width="100">
              <template #default="{ row }">
                <BizStatus type="ORDER_STATUS" :code="row.status" />
              </template>
            </ElTableColumn>
            <ElTableColumn prop="amountTotal" label="金额" width="100" align="right">
              <template #default="{ row }">{{ formatAmount(row.amountTotal) }}</template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </ElCol>
    </ElRow>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
  import { ElCard, ElRow, ElCol, ElTable, ElTableColumn } from 'element-plus'
  import { dashboardApi, type DashboardOverview } from '@/api/business'
  import { wsAdmin } from '@/utils/business/ws-admin'
  import { maskMobile, formatAmount } from '@/utils/business/format'
  import { BizChart, BizStatus } from '@/components/biz'

  const data = ref<DashboardOverview | null>(null)
  const refreshing = ref(false)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const kpis = computed(() => {
    const k = data.value?.kpi
    if (!k) return []
    return [
      {
        key: 'orders',
        title: '今日订单',
        value: k.todayOrders.toLocaleString(),
        hint: '实时刷新',
        color: '#409eff'
      },
      {
        key: 'amount',
        title: '今日交易额',
        value: formatAmount(k.todayAmount),
        hint: '不含退款',
        color: '#67c23a'
      },
      {
        key: 'users',
        title: '累计用户',
        value: k.totalUsers.toLocaleString(),
        hint: '注册数',
        color: '#722ed1'
      },
      {
        key: 'merchants',
        title: '累计商户',
        value: k.totalMerchants.toLocaleString(),
        hint: '已入驻',
        color: '#13c2c2'
      },
      {
        key: 'riders',
        title: '在线骑手',
        value: String(k.onlineRiders),
        hint: '当前在线',
        color: '#fa8c16'
      },
      {
        key: 'rate',
        title: '配送完成率',
        value: `${(k.deliveryRate * 100).toFixed(1)}%`,
        hint: '今日',
        color: '#52c41a'
      },
      {
        key: 'arb',
        title: '待处理仲裁',
        value: String(k.pendingArbitration),
        hint: '需关注',
        color: '#f5222d'
      },
      {
        key: 'audit',
        title: '待入驻审核',
        value: String(k.pendingMerchantAudit),
        hint: '需关注',
        color: '#fa541c'
      }
    ]
  })

  const trendOption = computed(() => {
    const trend: Array<{ hour: string; orders: number; amount: number }> = data.value?.trend || []
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['订单量', '交易额'] },
      grid: { top: 32, right: 30, bottom: 24, left: 50 },
      xAxis: { type: 'category', data: trend.map((t) => t.hour), boundaryGap: false },
      yAxis: [
        { type: 'value', name: '订单数' },
        { type: 'value', name: '交易额(¥)' }
      ],
      series: [
        {
          name: '订单量',
          type: 'line',
          smooth: true,
          areaStyle: { opacity: 0.18 },
          data: trend.map((t) => t.orders),
          itemStyle: { color: '#409eff' }
        },
        {
          name: '交易额',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: trend.map((t) => t.amount),
          itemStyle: { color: '#67c23a' }
        }
      ]
    }
  })

  const topProductsOption = computed(() => {
    const items: Array<{ name: string; sales: number }> = data.value?.topProducts || []
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 8, right: 32, bottom: 16, left: 100 },
      xAxis: { type: 'value' },
      yAxis: {
        type: 'category',
        data: items.map((i) => i.name).reverse(),
        axisLabel: { fontSize: 12 }
      },
      series: [
        {
          type: 'bar',
          data: items.map((i) => i.sales).reverse(),
          itemStyle: { color: '#722ed1' },
          barWidth: 14
        }
      ]
    }
  })

  const topShopsOption = computed(() => {
    const items: Array<{ name: string; orders: number }> = data.value?.topShops || []
    return {
      tooltip: { trigger: 'item' },
      grid: { top: 8, right: 32, bottom: 16, left: 100 },
      xAxis: { type: 'value' },
      yAxis: {
        type: 'category',
        data: items.map((i) => i.name).reverse(),
        axisLabel: { fontSize: 12 }
      },
      series: [
        {
          type: 'bar',
          data: items.map((i) => i.orders).reverse(),
          itemStyle: { color: '#13c2c2' },
          barWidth: 14
        }
      ]
    }
  })

  const anomalyOrders = computed(
    () => (data.value?.anomalyOrders || []) as Array<Record<string, unknown>>
  )

  async function refresh() {
    if (refreshing.value) return
    refreshing.value = true
    try {
      data.value = await dashboardApi.overview()
    } catch (e) {
      console.warn('[Overview] refresh failed', e)
    } finally {
      refreshing.value = false
    }
  }

  onMounted(() => {
    refresh()
    pollTimer = setInterval(refresh, 30_000)
    wsAdmin.on('admin:dashboard:tick', () => {
      refresh()
    })
  })
  onBeforeUnmount(() => {
    if (pollTimer) clearInterval(pollTimer)
    wsAdmin.off('admin:dashboard:tick', () => {})
  })
</script>

<style scoped lang="scss">
  .biz-dashboard-overview {
    padding: 12px;
  }

  .biz-kpi-card {
    margin-bottom: 12px;

    &__title {
      margin-bottom: 6px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }

    &__value {
      margin-bottom: 4px;
      font-size: 24px;
      font-weight: 600;
    }

    &__hint {
      font-size: 12px;
      color: var(--el-text-color-placeholder);
    }
  }
</style>
