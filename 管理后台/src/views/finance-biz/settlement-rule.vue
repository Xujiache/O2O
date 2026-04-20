<!--
  P8 分账规则（V8.28）
  - 全局 / 城市 / 店铺 override
-->
<template>
  <div class="biz-finance-settlement-rule">
    <ElCard shadow="hover">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <span>分账规则配置</span>
        </div>
      </template>
      <ElTable :data="rules" border size="small">
        <ElTableColumn label="范围" width="100">
          <template #default="{ row }">
            <ElTag>{{ row.scope }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="scopeKey" label="范围 Key" min-width="120" />
        <ElTableColumn label="平台分润 %" width="140" align="right">
          <template #default="{ row }">
            <ElInputNumber
              :model-value="Number(row.platformRate)"
              :min="0"
              :max="100"
              :step="0.5"
              :precision="2"
              size="small"
              @change="(v) => (row.platformRate = (v || 0).toFixed(2))"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="商户分润 %" width="140" align="right">
          <template #default="{ row }">
            <ElInputNumber
              :model-value="Number(row.merchantRate)"
              :min="0"
              :max="100"
              :step="0.5"
              :precision="2"
              size="small"
              @change="(v) => (row.merchantRate = (v || 0).toFixed(2))"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="骑手分润 %" width="140" align="right">
          <template #default="{ row }">
            <ElInputNumber
              :model-value="Number(row.riderRate)"
              :min="0"
              :max="100"
              :step="0.5"
              :precision="2"
              size="small"
              @change="(v) => (row.riderRate = (v || 0).toFixed(2))"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="启用" width="100">
          <template #default="{ row }">
            <ElSwitch v-model="row.enabled" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="100">
          <template #default="{ row }">
            <ElButton size="small" type="primary" link @click="onSaveRow(row)">保存</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import {
    ElCard,
    ElTable,
    ElTableColumn,
    ElInputNumber,
    ElSwitch,
    ElTag,
    ElButton,
    ElMessage
  } from 'element-plus'
  import { financeApi } from '@/api/business'
  import type { BizSettlementRule } from '@/types/business'

  const rules = ref<BizSettlementRule[]>([])

  async function load() {
    rules.value = await financeApi.settlementRuleList()
  }

  async function onSaveRow(row: BizSettlementRule) {
    const total = Number(row.platformRate) + Number(row.merchantRate) + Number(row.riderRate)
    if (Math.abs(total - 100) > 0.01) {
      ElMessage.warning(`平台+商户+骑手分润比例合计必须为 100%，当前为 ${total.toFixed(2)}%`)
      return
    }
    try {
      await financeApi.settlementRuleUpdate(row.id, row)
      ElMessage.success('已保存')
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
    }
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-finance-settlement-rule {
    padding: 12px;
  }
</style>
