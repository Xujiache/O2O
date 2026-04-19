<!--
  P8 骑手等级配置（V8.15）
  - 1-5 级配置（升级条件 / 派单加权）
  - 编辑保存
-->
<template>
  <div class="biz-rider-level-config">
    <ElCard shadow="hover">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <span>骑手等级配置（升级条件 + 派单加权）</span>
          <ElButton type="primary" :loading="submitting" @click="onSave">保存配置</ElButton>
        </div>
      </template>
      <ElTable :data="levels" border size="small">
        <ElTableColumn prop="level" label="等级" width="80" align="center">
          <template #default="{ row }">
            <ElTag>Lv.{{ row.level }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="name" label="名称" width="120">
          <template #default="{ row }">
            <ElInput v-model="row.name" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="月单数" width="160">
          <template #default="{ row }">
            <ElInputNumber
              :model-value="(row.condition?.ordersMonth as number) || 0"
              :min="0"
              size="small"
              @change="(v) => setCondition(row, 'ordersMonth', v)"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="评分要求" width="160">
          <template #default="{ row }">
            <ElInputNumber
              :model-value="(row.condition?.rating as number) || 0"
              :min="0"
              :max="5"
              :step="0.1"
              :precision="1"
              size="small"
              @change="(v) => setCondition(row, 'rating', v)"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="派单加权" width="160">
          <template #default="{ row }">
            <ElInputNumber
              v-model="row.weight"
              :min="0.5"
              :max="3"
              :step="0.05"
              :precision="2"
              size="small"
            />
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
    ElInput,
    ElInputNumber,
    ElTag,
    ElButton,
    ElMessage
  } from 'element-plus'
  import { riderApi } from '@/api/business'

  interface LevelConfig {
    level: number
    name: string
    condition: Record<string, unknown>
    weight: number
  }

  const levels = ref<LevelConfig[]>([])
  const submitting = ref(false)

  async function load() {
    levels.value = (await riderApi.levelConfig()) as LevelConfig[]
  }

  function setCondition(row: LevelConfig, key: string, val: number | undefined) {
    if (!row.condition) row.condition = {}
    row.condition[key] = val ?? 0
  }

  async function onSave() {
    submitting.value = true
    try {
      await riderApi.updateLevelConfig(levels.value)
      ElMessage.success('已保存')
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
    } finally {
      submitting.value = false
    }
  }
  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-rider-level-config {
    padding: 12px;
  }
</style>
