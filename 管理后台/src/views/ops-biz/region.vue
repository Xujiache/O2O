<!--
  P8 区域配置（V8.26 含 polygon 圈选）
-->
<template>
  <div class="biz-ops-region">
    <ElCard shadow="hover">
      <template #header>城市区域配置</template>
      <ElTable :data="regions" border size="small">
        <ElTableColumn prop="cityCode" label="城市编码" width="120" />
        <ElTableColumn prop="cityName" label="城市" width="120" />
        <ElTableColumn label="基础配送费" width="140" align="right">
          <template #default="{ row }">{{ formatAmount(row.baseDeliveryFee) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="errandPriceFormula" label="跑腿定价公式" min-width="180" />
        <ElTableColumn label="启用" width="80" align="center">
          <template #default="{ row }">
            <ElSwitch :model-value="row.enabled" @change="(v) => onToggle(row, !!v)" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="200" align="center">
          <template #default="{ row }">
            <ElButton size="small" type="primary" link @click="onEdit(row)">编辑参数</ElButton>
            <ElButton size="small" type="warning" link @click="onPolygon(row)">编辑边界</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <BizModal
      v-model="editVisible"
      :title="(editing?.cityName || '') + ' - 参数'"
      :show-footer="false"
    >
      <ElForm v-if="editing" :model="editing" label-width="120px">
        <ElFormItem label="基础配送费" required>
          <ElInputNumber
            :model-value="Number(editing.baseDeliveryFee)"
            :min="0"
            :step="0.5"
            :precision="2"
            controls-position="right"
            @change="(v) => onFee(v as number | null | undefined)"
          />
        </ElFormItem>
        <ElFormItem label="跑腿定价公式">
          <ElInput v-model="editing.errandPriceFormula" placeholder="如：5+1*distance" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="loading" @click="onSave">保存</ElButton>
      </template>
    </BizModal>

    <BizModal
      v-model="polygonVisible"
      :title="`${currentRegion?.cityName} - 区域边界`"
      width="900px"
      :show-footer="false"
      destroy-on-close
    >
      <BizPolygonEditor v-if="polygonVisible" v-model="polygonPoints" />
      <template #footer>
        <ElButton @click="polygonVisible = false">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="polygonPoints.length < 3"
          :loading="loading"
          @click="onSavePolygon"
        >
          保存
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import {
    ElCard,
    ElTable,
    ElTableColumn,
    ElForm,
    ElFormItem,
    ElInput,
    ElInputNumber,
    ElSwitch,
    ElButton,
    ElMessage
  } from 'element-plus'
  import { opsApi } from '@/api/business'
  import type { BizRegion } from '@/types/business'
  import { BizModal, BizPolygonEditor } from '@/components/biz'
  import { formatAmount } from '@/utils/business/format'

  const regions = ref<BizRegion[]>([])
  const editVisible = ref(false)
  const polygonVisible = ref(false)
  const editing = ref<BizRegion | null>(null)
  const currentRegion = ref<BizRegion | null>(null)
  const polygonPoints = ref<Array<{ lng: number; lat: number }>>([])
  const loading = ref(false)

  async function load() {
    regions.value = await opsApi.regionList()
  }

  async function onToggle(row: BizRegion, v: boolean) {
    try {
      await opsApi.regionToggle(row.cityCode, v)
      row.enabled = v
      ElMessage.success(v ? '已启用' : '已停用')
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    }
  }

  function onEdit(row: BizRegion) {
    editing.value = { ...row }
    editVisible.value = true
  }

  function onFee(v: number | null | undefined) {
    if (!editing.value) return
    editing.value.baseDeliveryFee = (v || 0).toFixed(2)
  }

  function onPolygon(row: BizRegion) {
    currentRegion.value = row
    polygonPoints.value = row.polygon ? [...row.polygon] : []
    polygonVisible.value = true
  }

  async function onSave() {
    if (!editing.value) return
    loading.value = true
    try {
      await opsApi.regionSave(editing.value)
      ElMessage.success('已保存')
      editVisible.value = false
      load()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
    } finally {
      loading.value = false
    }
  }

  async function onSavePolygon() {
    if (!currentRegion.value) return
    if (polygonPoints.value.length < 3) {
      ElMessage.warning('至少 3 个顶点')
      return
    }
    loading.value = true
    try {
      await opsApi.regionSave({ ...currentRegion.value, polygon: polygonPoints.value })
      ElMessage.success('已保存')
      polygonVisible.value = false
      load()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
    } finally {
      loading.value = false
    }
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-ops-region {
    padding: 12px;
  }
</style>
