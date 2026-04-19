<!--
  P8 订单详情（V8.17 BizOrderFlow 关键组件）
  - 基础信息卡
  - 状态流程图（BizOrderFlow）
  - 商品/跑腿信息
  - 操作按钮（强制取消 / 仲裁）
-->
<template>
  <div class="biz-order-detail" v-loading="loading">
    <ElPageHeader @back="$router.back()">
      <template #content>
        <span style="font-size: 18px">订单详情：{{ orderNo }}</span>
      </template>
    </ElPageHeader>

    <ElCard v-if="info" shadow="hover" style="margin-top: 12px">
      <template #header>状态流程</template>
      <BizOrderFlow :nodes="info.flow || []" />
    </ElCard>

    <ElCard v-if="info" shadow="hover" style="margin-top: 12px">
      <template #header>基础信息</template>
      <ElDescriptions :column="3" border>
        <ElDescriptionsItem label="订单号">{{ info.orderNo }}</ElDescriptionsItem>
        <ElDescriptionsItem label="类型">{{ info.bizType }}</ElDescriptionsItem>
        <ElDescriptionsItem label="状态">
          <BizStatus type="ORDER_STATUS" :code="info.status" />
        </ElDescriptionsItem>
        <ElDescriptionsItem label="下单时间">{{ fmtDateTime(info.createdAt) }}</ElDescriptionsItem>
        <ElDescriptionsItem label="支付时间">{{ fmtDateTime(info.payAt) }}</ElDescriptionsItem>
        <ElDescriptionsItem label="完成时间">{{ fmtDateTime(info.finishedAt) }}</ElDescriptionsItem>
        <ElDescriptionsItem label="用户">{{ maskMobile(info.userMobile) }}</ElDescriptionsItem>
        <ElDescriptionsItem label="店铺">{{ info.shopName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="骑手">{{ info.riderName || '-' }}</ElDescriptionsItem>
        <ElDescriptionsItem label="金额合计">{{
          formatAmount(info.amountTotal)
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="实收">{{
          formatAmount(info.amountReceivable)
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="城市">{{ info.cityName }}</ElDescriptionsItem>
      </ElDescriptions>
    </ElCard>

    <ElCard v-if="info" shadow="hover" style="margin-top: 12px">
      <template #header>商品清单</template>
      <ElTable :data="info.items || []" size="small" border>
        <ElTableColumn prop="name" label="商品" min-width="200" />
        <ElTableColumn prop="qty" label="数量" width="100" align="right" />
        <ElTableColumn prop="price" label="单价" width="120" align="right">
          <template #default="{ row }">{{ formatAmount(row.price) }}</template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElCard v-if="info" shadow="hover" style="margin-top: 12px">
      <template #header>操作</template>
      <ElButton
        v-if="info.status < 60 && info.status !== 70"
        type="danger"
        @click="cancelVisible = true"
      >
        强制取消
      </ElButton>
      <ElButton :type="'warning'" @click="onArbitrate">提起仲裁</ElButton>
    </ElCard>

    <BizConfirmDialog
      v-model="cancelVisible"
      title="强制取消订单"
      :message="`即将强制取消订单 ${orderNo}（金额 ${formatAmount(info?.amountTotal)}）`"
      @confirm="onForceCancel"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import {
    ElCard,
    ElDescriptions,
    ElDescriptionsItem,
    ElTable,
    ElTableColumn,
    ElButton,
    ElPageHeader,
    ElMessage,
    vLoading
  } from 'element-plus'
  import { orderApi } from '@/api/business'
  import type { BizOrder, OrderFlowNode } from '@/types/business'
  import { BizOrderFlow, BizStatus, BizConfirmDialog } from '@/components/biz'
  import { maskMobile, formatAmount, fmtDateTime } from '@/utils/business/format'

  const route = useRoute()
  const router = useRouter()
  const orderNo = ref(String(route.params.orderNo || ''))
  const info = ref<
    | (BizOrder & {
        flow?: OrderFlowNode[]
        items?: Array<{ name: string; qty: number; price: string }>
      })
    | null
  >(null)
  const loading = ref(false)
  const cancelVisible = ref(false)

  async function load() {
    loading.value = true
    try {
      info.value = (await orderApi.detail(orderNo.value)) as typeof info.value
    } finally {
      loading.value = false
    }
  }

  async function onForceCancel() {
    try {
      await orderApi.forceCancel(orderNo.value, '管理员强制取消')
      ElMessage.success('已取消')
      cancelVisible.value = false
      load()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    }
  }

  function onArbitrate() {
    router.push({ name: 'BizOrderArbitration', query: { orderNo: orderNo.value } })
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-order-detail {
    padding: 12px;
  }
</style>
