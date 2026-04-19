<!--
  P8 用户详情（V8.6）
  - 基础信息卡
  - Tab：订单 / 消费 / 地址 / 优惠券 / 余额明细 / 投诉
-->
<template>
  <div class="biz-user-detail" v-loading="loading">
    <ElPageHeader @back="$router.back()">
      <template #content>
        <span style="font-size: 18px; font-weight: 500">用户详情</span>
      </template>
    </ElPageHeader>

    <ElCard v-if="info" shadow="hover" style="margin-top: 12px">
      <template #header>基础信息</template>
      <ElDescriptions :column="3" border>
        <ElDescriptionsItem label="ID">{{ info.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="昵称">{{ info.nickname }}</ElDescriptionsItem>
        <ElDescriptionsItem label="手机号">{{ maskMobile(info.mobile) }}</ElDescriptionsItem>
        <ElDescriptionsItem label="渠道">{{ info.channel }}</ElDescriptionsItem>
        <ElDescriptionsItem label="状态">
          <BizStatus type="USER_STATUS" :code="info.status" />
        </ElDescriptionsItem>
        <ElDescriptionsItem label="注册时间">{{
          fmtDateTime(info.registeredAt)
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="订单数">{{ info.orderCount }}</ElDescriptionsItem>
        <ElDescriptionsItem label="消费总额">{{
          formatAmount(info.totalSpend)
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="余额">{{ formatAmount(info.balance) }}</ElDescriptionsItem>
      </ElDescriptions>
    </ElCard>

    <ElCard shadow="hover" style="margin-top: 12px">
      <ElTabs v-model="activeTab">
        <ElTabPane label="订单" name="orders">
          <ElTable :data="(info?.orders as Array<Record<string, unknown>>) || []" size="small">
            <ElTableColumn prop="orderNo" label="订单号" width="200" show-overflow-tooltip />
            <ElTableColumn label="状态" width="100">
              <template #default="{ row }">
                <BizStatus type="ORDER_STATUS" :code="row.status" />
              </template>
            </ElTableColumn>
            <ElTableColumn prop="amountTotal" label="金额" width="120" align="right">
              <template #default="{ row }">{{ formatAmount(row.amountTotal) }}</template>
            </ElTableColumn>
            <ElTableColumn prop="createdAt" label="时间" width="180">
              <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
            </ElTableColumn>
          </ElTable>
        </ElTabPane>
        <ElTabPane label="地址" name="addresses">
          <ElTable :data="(info?.addresses as Array<Record<string, unknown>>) || []" size="small">
            <ElTableColumn prop="address" label="地址" min-width="200" show-overflow-tooltip />
            <ElTableColumn prop="tag" label="标签" width="80" />
            <ElTableColumn label="默认" width="80" align="center">
              <template #default="{ row }">
                <ElTag v-if="row.isDefault" type="success" size="small">默认</ElTag>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElTabPane>
        <ElTabPane label="优惠券" name="coupons">
          <ElTable :data="(info?.coupons as Array<Record<string, unknown>>) || []" size="small">
            <ElTableColumn prop="templateName" label="模板" min-width="160" />
            <ElTableColumn prop="status" label="状态" width="80" />
            <ElTableColumn prop="expiredAt" label="过期时间" width="180">
              <template #default="{ row }">{{ fmtDateTime(row.expiredAt) }}</template>
            </ElTableColumn>
          </ElTable>
        </ElTabPane>
        <ElTabPane label="余额明细" name="balance">
          <ElTable
            :data="(info?.balanceFlows as Array<Record<string, unknown>>) || []"
            size="small"
          >
            <ElTableColumn prop="type" label="类型" width="100" />
            <ElTableColumn prop="amount" label="金额" width="120" align="right">
              <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
            </ElTableColumn>
            <ElTableColumn prop="createdAt" label="时间" width="180">
              <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
            </ElTableColumn>
          </ElTable>
        </ElTabPane>
        <ElTabPane label="投诉" name="complaints">
          <ElTable :data="(info?.complaints as Array<Record<string, unknown>>) || []" size="small">
            <ElTableColumn prop="reason" label="原因" min-width="180" show-overflow-tooltip />
            <ElTableColumn prop="status" label="状态" width="80" />
            <ElTableColumn prop="createdAt" label="时间" width="180">
              <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
            </ElTableColumn>
          </ElTable>
        </ElTabPane>
      </ElTabs>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import {
    ElCard,
    ElTabs,
    ElTabPane,
    ElTable,
    ElTableColumn,
    ElTag,
    ElDescriptions,
    ElDescriptionsItem,
    ElPageHeader,
    vLoading
  } from 'element-plus'
  import { userApi } from '@/api/business'
  import type { BizUser, UserDetailExtra } from '@/types/business'
  import { BizStatus } from '@/components/biz'
  import { maskMobile, formatAmount, fmtDateTime } from '@/utils/business/format'

  const route = useRoute()
  const info = ref<(BizUser & UserDetailExtra & { orders?: unknown[] }) | null>(null)
  const loading = ref(false)
  const activeTab = ref('orders')

  async function load() {
    loading.value = true
    try {
      const id = route.params.id as string
      info.value = (await userApi.detail(id)) as typeof info.value
    } catch (e) {
      console.warn('[UserDetail] load failed', e)
    } finally {
      loading.value = false
    }
  }
  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-user-detail {
    padding: 12px;
  }
</style>
