<!--
  P8 财务概览（V8.27）
  - 营收 / 分佣 / 退款 / 流水趋势（折线图）
-->
<template>
  <div class="biz-finance-overview" v-loading="loading">
    <ElRow :gutter="12">
      <ElCol :xs="24" :sm="12" :md="6">
        <ElCard shadow="hover">
          <div class="overview-card">
            <div class="overview-card__title">总营收</div>
            <div class="overview-card__value" style="color: #67c23a">
              {{ formatAmount(data?.income) }}
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :sm="12" :md="6">
        <ElCard shadow="hover">
          <div class="overview-card">
            <div class="overview-card__title">总分佣</div>
            <div class="overview-card__value" style="color: #409eff">
              {{ formatAmount(data?.commission) }}
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :sm="12" :md="6">
        <ElCard shadow="hover">
          <div class="overview-card">
            <div class="overview-card__title">退款总额</div>
            <div class="overview-card__value" style="color: #e6a23c">
              {{ formatAmount(data?.refund) }}
            </div>
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :sm="12" :md="6">
        <ElCard shadow="hover">
          <div class="overview-card">
            <div class="overview-card__title">账户余额</div>
            <div class="overview-card__value" style="color: #722ed1">
              {{ formatAmount(data?.balance) }}
            </div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <ElCard shadow="hover" style="margin-top: 12px">
      <template #header>30 日财务趋势</template>
      <BizChart :option="trendOption" height="360px" />
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { ElCard, ElRow, ElCol, vLoading } from 'element-plus'
  import { financeApi } from '@/api/business'
  import { BizChart } from '@/components/biz'
  import { formatAmount } from '@/utils/business/format'

  interface FinanceOverview {
    income: string
    commission: string
    refund: string
    balance: string
    trend: Array<{ date: string; income: number; commission: number; refund: number }>
  }
  const data = ref<FinanceOverview | null>(null)
  const loading = ref(false)

  const trendOption = computed(() => {
    const trend: Array<{ date: string; income: number; commission: number; refund: number }> =
      data.value?.trend || []
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['营收', '分佣', '退款'] },
      grid: { top: 32, right: 24, bottom: 24, left: 50 },
      xAxis: { type: 'category', data: trend.map((t) => t.date), boundaryGap: false },
      yAxis: { type: 'value' },
      series: [
        {
          name: '营收',
          type: 'line',
          smooth: true,
          data: trend.map((t) => t.income),
          itemStyle: { color: '#67c23a' }
        },
        {
          name: '分佣',
          type: 'line',
          smooth: true,
          data: trend.map((t) => t.commission),
          itemStyle: { color: '#409eff' }
        },
        {
          name: '退款',
          type: 'line',
          smooth: true,
          data: trend.map((t) => t.refund),
          itemStyle: { color: '#e6a23c' }
        }
      ]
    }
  })

  async function load() {
    loading.value = true
    try {
      data.value = (await financeApi.overview()) as FinanceOverview
    } finally {
      loading.value = false
    }
  }
  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-finance-overview {
    padding: 12px;
  }

  .overview-card {
    padding: 8px 0;
    text-align: center;

    &__title {
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }

    &__value {
      font-size: 24px;
      font-weight: 600;
    }
  }
</style>
