<!--
  P8 骑手奖惩配置（V8.14）
  - 规则列表（罚 / 奖）
  - 批量发放：选择多名骑手 + 应用规则
-->
<template>
  <div class="biz-rider-reward">
    <ElCard shadow="hover">
      <template #header>奖惩规则</template>
      <ElTable :data="rules" size="small" border>
        <ElTableColumn prop="name" label="规则名" min-width="200" />
        <ElTableColumn label="类型" width="100">
          <template #default="{ row }">
            <ElTag :type="row.type === 'reward' ? 'success' : 'danger'">
              {{ row.type === 'reward' ? '奖励' : '处罚' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="threshold" label="阈值" width="100" align="right" />
        <ElTableColumn label="金额" width="120" align="right">
          <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
        </ElTableColumn>
        <ElTableColumn label="启用" width="80">
          <template #default="{ row }">
            <ElTag v-if="row.enabled" type="success" size="small">启用</ElTag>
            <ElTag v-else type="info" size="small">停用</ElTag>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElCard shadow="hover" style="margin-top: 12px">
      <template #header>批量发放奖惩</template>
      <ElForm :model="form" label-width="100px" inline>
        <ElFormItem label="规则" required>
          <ElSelect v-model="form.ruleId" placeholder="选择规则" style="width: 280px">
            <ElOption
              v-for="r in rules"
              :key="String(r.id)"
              :value="r.id"
              :label="`${r.name}（${r.type === 'reward' ? '奖' : '罚'} ${formatAmount(r.amount)}）`"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="选择骑手" required>
          <ElButton @click="pickerVisible = true">
            已选 {{ selectedRiders.length }} 名 / 修改
          </ElButton>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :loading="submitting" @click="onBatchApply"> 批量发放 </ElButton>
        </ElFormItem>
      </ElForm>
      <ElAlert
        v-if="lastResult"
        :title="`上次执行：成功 ${lastResult.ok}，失败 ${lastResult.fail}`"
        :type="lastResult.fail > 0 ? 'warning' : 'success'"
        show-icon
        :closable="false"
      />
    </ElCard>

    <BizModal v-model="pickerVisible" title="选择骑手（可多选）" width="900px" :show-footer="false">
      <BizTable
        ref="riderTable"
        :columns="riderColumns"
        :search-schema="riderSearch"
        :fetch="fetchRiders"
        row-key="id"
        :batch-actions="[
          {
            label: '加入选中',
            type: 'primary',
            onClick: (sel) => {
              selectedRiders = sel as Array<Record<string, unknown>>
              pickerVisible = false
            }
          }
        ]"
      />
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import {
    ElCard,
    ElTable,
    ElTableColumn,
    ElTag,
    ElForm,
    ElFormItem,
    ElSelect,
    ElOption,
    ElButton,
    ElAlert,
    ElMessage
  } from 'element-plus'
  import { riderApi } from '@/api/business'
  import type { BizRider, BizListParams, BizId } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'
  import { formatAmount } from '@/utils/business/format'

  interface Rule {
    id: BizId
    type: 'punish' | 'reward'
    name: string
    threshold: number
    amount: string
    enabled: boolean
  }

  const rules = ref<Rule[]>([])
  const pickerVisible = ref(false)
  const selectedRiders = ref<Array<Record<string, unknown>>>([])
  const submitting = ref(false)
  const lastResult = ref<{ ok: number; fail: number } | null>(null)
  const form = reactive<{ ruleId: BizId | undefined }>({ ruleId: undefined })
  const riderTable = ref<InstanceType<typeof BizTable> | null>(null)

  async function loadRules() {
    rules.value = (await riderApi.rewardRules()) as Rule[]
  }

  const riderSearch = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '姓名 / 手机' }
  ]
  const riderColumns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'realName', label: '姓名', width: 100 },
    { prop: 'cityName', label: '城市', width: 80 },
    { prop: 'level', label: '等级', width: 70, formatter: (_r, _c, v) => `Lv.${v}` },
    { prop: 'todayOrders', label: '今日单数', width: 100, align: 'right' }
  ]

  async function fetchRiders(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string
    }
    const resp = await riderApi.list(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }

  async function onBatchApply() {
    if (!form.ruleId) {
      ElMessage.warning('请选择规则')
      return
    }
    if (!selectedRiders.value.length) {
      ElMessage.warning('请选择至少 1 名骑手')
      return
    }
    const rule = rules.value.find((r) => r.id === form.ruleId)
    if (!rule) return
    submitting.value = true
    try {
      const ids = selectedRiders.value.map((r) => (r as unknown as BizRider).id)
      await riderApi.rewardBatch(ids, {
        type: rule.type,
        amount: rule.amount,
        reason: rule.name
      })
      lastResult.value = { ok: ids.length, fail: 0 }
      ElMessage.success(`已发放 ${ids.length} 名骑手`)
    } catch (e) {
      lastResult.value = { ok: 0, fail: selectedRiders.value.length }
      ElMessage.error((e as Error)?.message || '发放失败')
    } finally {
      submitting.value = false
    }
  }

  onMounted(loadRules)
</script>

<style scoped lang="scss">
  .biz-rider-reward {
    padding: 12px;
  }
</style>
