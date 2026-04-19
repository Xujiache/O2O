<!--
  P8 数据大盘 - 运营数据
  - 商家 / 商品 / 骑手 Top 10
  - 城市订单分布
  - 异常统计（投诉/退款/仲裁）
-->
<template>
  <div class="biz-ops">
    <ElRow :gutter="12">
      <ElCol :xs="24" :md="12">
        <ElCard shadow="hover">
          <template #header>商家销量 Top 10</template>
          <BizChart :option="optShops" height="320px" />
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :md="12">
        <ElCard shadow="hover">
          <template #header>商品销量 Top 10</template>
          <BizChart :option="optProducts" height="320px" />
        </ElCard>
      </ElCol>
    </ElRow>
    <ElRow :gutter="12" style="margin-top: 12px">
      <ElCol :xs="24" :md="12">
        <ElCard shadow="hover">
          <template #header>骑手排行 Top 10</template>
          <ElTable :data="data?.topRiders || []" size="small" max-height="360">
            <ElTableColumn type="index" width="50" />
            <ElTableColumn prop="name" label="骑手" min-width="120" />
            <ElTableColumn prop="orders" label="订单数" align="right" width="100" />
            <ElTableColumn prop="rating" label="评分" align="right" width="80">
              <template #default="{ row }">{{ row.rating?.toFixed(1) || '-' }}</template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :md="12">
        <ElCard shadow="hover">
          <template #header>城市订单分布</template>
          <BizChart :option="optCity" height="360px" />
        </ElCard>
      </ElCol>
    </ElRow>
    <ElRow :gutter="12" style="margin-top: 12px">
      <ElCol :span="24">
        <ElCard shadow="hover">
          <template #header>异常统计</template>
          <div class="biz-ops__stat">
            <div class="biz-ops__stat-item">
              <div class="biz-ops__stat-label">投诉数</div>
              <div class="biz-ops__stat-value" style="color: #f56c6c">{{
                data?.anomalyStat?.complaintCount || 0
              }}</div>
            </div>
            <div class="biz-ops__stat-item">
              <div class="biz-ops__stat-label">退款数</div>
              <div class="biz-ops__stat-value" style="color: #e6a23c">{{
                data?.anomalyStat?.refundCount || 0
              }}</div>
            </div>
            <div class="biz-ops__stat-item">
              <div class="biz-ops__stat-label">仲裁数</div>
              <div class="biz-ops__stat-value" style="color: #909399">{{
                data?.anomalyStat?.arbitrationCount || 0
              }}</div>
            </div>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import { ElCard, ElRow, ElCol, ElTable, ElTableColumn } from 'element-plus'
  import { dashboardApi, type DashboardOps } from '@/api/business'
  import { BizChart } from '@/components/biz'

  const data = ref<DashboardOps | null>(null)

  const optShops = computed(() => {
    const items = data.value?.topShops || []
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 8, right: 32, bottom: 16, left: 100 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: items.map((i) => i.name).reverse() },
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

  const optProducts = computed(() => {
    const items = data.value?.topProducts || []
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 8, right: 32, bottom: 16, left: 100 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: items.map((i) => i.name).reverse() },
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

  const optCity = computed(() => {
    const items = data.value?.cityDistribution || []
    return {
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 'left' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          label: { formatter: '{b}: {c} ({d}%)' },
          data: items.map((i) => ({ name: i.city, value: i.count }))
        }
      ]
    }
  })

  async function load() {
    data.value = await dashboardApi.ops()
  }
  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-ops {
    padding: 12px;

    &__stat {
      display: flex;
      gap: 32px;
      align-items: flex-end;
      justify-content: space-around;
      padding: 12px 24px;
    }

    &__stat-label {
      margin-bottom: 4px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }

    &__stat-value {
      font-size: 32px;
      font-weight: 600;
    }
  }
</style>
