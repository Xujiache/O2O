<!--
  P8 商户详情
  - 基础信息卡 + 资质 + 店铺列表
-->
<template>
  <div class="biz-merchant-detail" v-loading="loading">
    <ElPageHeader @back="$router.back()">
      <template #content>
        <span style="font-size: 18px">商户详情</span>
      </template>
    </ElPageHeader>

    <ElCard v-if="info" shadow="hover" style="margin-top: 12px">
      <template #header>基础信息</template>
      <ElDescriptions :column="3" border>
        <ElDescriptionsItem label="ID">{{ info.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="商户名">{{ info.name }}</ElDescriptionsItem>
        <ElDescriptionsItem label="联系人">{{ info.contact }}</ElDescriptionsItem>
        <ElDescriptionsItem label="手机号">{{ info.mobile }}</ElDescriptionsItem>
        <ElDescriptionsItem label="城市">{{ info.cityName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="店铺数">{{ info.shopCount }}</ElDescriptionsItem>
        <ElDescriptionsItem label="审核状态">
          <BizStatus type="MERCHANT_AUDIT_STATUS" :code="info.auditStatus" />
        </ElDescriptionsItem>
        <ElDescriptionsItem label="营业状态">
          <BizStatus type="MERCHANT_BIZ_STATUS" :code="info.bizStatus" />
        </ElDescriptionsItem>
        <ElDescriptionsItem label="入驻时间">{{ fmtDateTime(info.createdAt) }}</ElDescriptionsItem>
      </ElDescriptions>
    </ElCard>

    <ElCard v-if="info" shadow="hover" style="margin-top: 12px">
      <template #header>旗下店铺（{{ shops.length }}）</template>
      <ElTable :data="shops" size="small" border>
        <ElTableColumn prop="id" label="ID" width="100" />
        <ElTableColumn prop="name" label="店铺名" min-width="200" />
        <ElTableColumn prop="cityName" label="城市" width="100" />
        <ElTableColumn prop="address" label="地址" min-width="200" show-overflow-tooltip />
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <BizStatus type="MERCHANT_BIZ_STATUS" :code="row.status" />
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import {
    ElCard,
    ElDescriptions,
    ElDescriptionsItem,
    ElTable,
    ElTableColumn,
    ElPageHeader,
    vLoading
  } from 'element-plus'
  import { merchantApi } from '@/api/business'
  import type { BizMerchant, BizShop } from '@/types/business'
  import { BizStatus } from '@/components/biz'
  import { fmtDateTime } from '@/utils/business/format'

  const route = useRoute()
  const info = ref<(BizMerchant & { shops?: BizShop[] }) | null>(null)
  const shops = ref<BizShop[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const id = route.params.id as string
      const detail = await merchantApi.detail(id)
      info.value = detail as typeof info.value
      shops.value = (detail.shops || []) as BizShop[]
    } finally {
      loading.value = false
    }
  }
  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-merchant-detail {
    padding: 12px;
  }
</style>
