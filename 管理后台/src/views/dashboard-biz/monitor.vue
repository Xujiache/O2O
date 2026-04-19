<!--
  P8 数据大盘 - 实时监控（V8.4）
  - WS admin:dashboard:tick / admin:complaint:new / admin:arbitration:pending / admin:risk:hit
  - 5s 内感知新待处理项
-->
<template>
  <div class="biz-monitor">
    <ElRow :gutter="12">
      <ElCol :xs="24" :md="12">
        <ElCard shadow="hover">
          <template #header>
            待仲裁（{{ pendingArbitration.length }}）
            <ElTag v-if="wsConnected" type="success" size="small" style="float: right"
              >WS 已连接</ElTag
            >
            <ElTag v-else type="info" size="small" style="float: right">轮询模式</ElTag>
          </template>
          <ElTable :data="pendingArbitration" size="small" max-height="320">
            <ElTableColumn prop="orderNo" label="订单号" width="200" show-overflow-tooltip />
            <ElTableColumn prop="reason" label="原因" min-width="180" show-overflow-tooltip />
            <ElTableColumn prop="applicantName" label="申请人" width="100" />
            <ElTableColumn prop="createdAt" label="申请时间" width="160">
              <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :md="12">
        <ElCard shadow="hover">
          <template #header>待入驻审核（{{ pendingAudit.length }}）</template>
          <ElTable :data="pendingAudit" size="small" max-height="320">
            <ElTableColumn prop="name" label="商户" min-width="150" />
            <ElTableColumn prop="cityName" label="城市" width="80" />
            <ElTableColumn prop="contact" label="联系人" width="100" />
            <ElTableColumn prop="createdAt" label="提交时间" width="160">
              <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </ElCol>
    </ElRow>
    <ElRow :gutter="12" style="margin-top: 12px">
      <ElCol :xs="24" :md="12">
        <ElCard shadow="hover">
          <template #header>新投诉（{{ complaintNew.length }}）</template>
          <ElTable :data="complaintNew" size="small" max-height="280">
            <ElTableColumn prop="reporter" label="投诉人" width="120" />
            <ElTableColumn prop="category" label="分类" width="100" />
            <ElTableColumn prop="content" label="内容" min-width="180" show-overflow-tooltip />
            <ElTableColumn prop="createdAt" label="时间" width="160">
              <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </ElCol>
      <ElCol :xs="24" :md="12">
        <ElCard shadow="hover">
          <template #header>风控告警（{{ riskHits.length }}）</template>
          <ElTable :data="riskHits" size="small" max-height="280">
            <ElTableColumn prop="orderNo" label="订单号" width="200" show-overflow-tooltip />
            <ElTableColumn prop="reason" label="原因" min-width="180" show-overflow-tooltip />
            <ElTableColumn label="等级" width="80">
              <template #default="{ row }">
                <BizStatus type="RISK_LEVEL" :code="row.level" />
              </template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </ElCol>
    </ElRow>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount } from 'vue'
  import { ElCard, ElRow, ElCol, ElTable, ElTableColumn, ElTag } from 'element-plus'
  import { dashboardApi, type DashboardMonitor } from '@/api/business'
  import { wsAdmin } from '@/utils/business/ws-admin'
  import { fmtDateTime } from '@/utils/business/format'
  import { BizStatus } from '@/components/biz'

  const data = ref<DashboardMonitor | null>(null)
  const wsConnected = ref(false)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const pendingArbitration = ref<Array<Record<string, unknown>>>([])
  const pendingAudit = ref<Array<Record<string, unknown>>>([])
  const complaintNew = ref<Array<Record<string, unknown>>>([])
  const riskHits = ref<Array<Record<string, unknown>>>([])

  async function load() {
    data.value = await dashboardApi.monitor()
    pendingArbitration.value = (data.value?.pendingArbitration || []) as Array<
      Record<string, unknown>
    >
    pendingAudit.value = (data.value?.pendingAudit || []) as Array<Record<string, unknown>>
    complaintNew.value = (data.value?.complaintNew || []) as Array<Record<string, unknown>>
    riskHits.value = (data.value?.riskHits || []) as Array<Record<string, unknown>>
  }

  function onWsMessage() {
    load()
  }

  onMounted(() => {
    load()
    wsConnected.value = wsAdmin.isOpen
    pollTimer = setInterval(load, 30_000)
    wsAdmin.on('admin:complaint:new', onWsMessage)
    wsAdmin.on('admin:arbitration:pending', onWsMessage)
    wsAdmin.on('admin:risk:hit', onWsMessage)
    wsAdmin.on('open', () => {
      wsConnected.value = true
    })
    wsAdmin.on('close', () => {
      wsConnected.value = false
    })
  })
  onBeforeUnmount(() => {
    if (pollTimer) clearInterval(pollTimer)
    wsAdmin.off('admin:complaint:new', onWsMessage)
    wsAdmin.off('admin:arbitration:pending', onWsMessage)
    wsAdmin.off('admin:risk:hit', onWsMessage)
  })
</script>

<style scoped lang="scss">
  .biz-monitor {
    padding: 12px;
  }
</style>
