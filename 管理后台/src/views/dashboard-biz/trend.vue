<!--
  P8 数据大盘 - 趋势图（V8.2）
  - 订单量 / 交易额 / 用户增长 / 商户增长
  - 日 / 周 / 月 切换
-->
<template>
  <div class="biz-trend">
    <ElCard shadow="hover">
      <template #header>
        <div class="biz-trend__header">
          <span>多维趋势</span>
          <ElRadioGroup v-model="period" size="small" @change="load">
            <ElRadioButton value="day">日</ElRadioButton>
            <ElRadioButton value="week">周</ElRadioButton>
            <ElRadioButton value="month">月</ElRadioButton>
          </ElRadioGroup>
        </div>
      </template>
      <BizChart :option="option" height="420px" />
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { ElCard, ElRadioGroup, ElRadioButton } from 'element-plus'
  import { dashboardApi } from '@/api/business'
  import type { DashboardTrendItem } from '@/api/business'
  import { BizChart } from '@/components/biz'

  const period = ref<'day' | 'week' | 'month'>('day')
  const data = ref<DashboardTrendItem[]>([])

  const option = computed(() => {
    const xs = data.value.map((d: DashboardTrendItem) => String(d.ts))
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['订单量', '交易额', '用户增长', '商户增长'] },
      grid: { top: 32, right: 50, bottom: 24, left: 50 },
      xAxis: { type: 'category', data: xs, boundaryGap: false },
      yAxis: [
        { type: 'value', name: '数量' },
        { type: 'value', name: '交易额(¥)' }
      ],
      series: [
        {
          name: '订单量',
          type: 'line',
          smooth: true,
          data: data.value.map((d: DashboardTrendItem) => d.orders)
        },
        {
          name: '交易额',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: data.value.map((d: DashboardTrendItem) => d.amount)
        },
        {
          name: '用户增长',
          type: 'line',
          smooth: true,
          data: data.value.map((d: DashboardTrendItem) => d.users)
        },
        {
          name: '商户增长',
          type: 'line',
          smooth: true,
          data: data.value.map((d: DashboardTrendItem) => d.merchants)
        }
      ]
    }
  })

  async function load() {
    data.value = await dashboardApi.trend({ period: period.value })
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-trend {
    padding: 12px;

    &__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
  }
</style>
