<!--
  P8 营销活动（V8.24）
  - 满减 / 折扣 / 拼单 / 邀请 / 新客
-->
<template>
  <div class="biz-ops-promotion">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增活动</ElButton>
      </template>
      <template #cell-enabled="{ row }">
        <ElSwitch :model-value="rowEnabled(row)" @change="(v) => onToggle(row, !!v)" />
      </template>
    </BizTable>

    <BizModal
      v-model="editVisible"
      :title="editing ? '编辑活动' : '新增活动'"
      width="600px"
      :show-footer="false"
    >
      <ElForm :model="form" label-width="100px">
        <ElFormItem label="活动名称" required>
          <ElInput v-model="form.name" placeholder="请输入活动名称" />
        </ElFormItem>
        <ElFormItem label="类型" required>
          <template v-if="editing">
            <ElTag>{{ typeLabel(form.type) }}</ElTag>
          </template>
          <template v-else>
            <ElSelect v-model="form.type" placeholder="请选择类型">
              <ElOption value="fullCut" label="满减" />
              <ElOption value="discount" label="折扣" />
              <ElOption value="group" label="拼单" />
              <ElOption value="invite" label="邀请" />
              <ElOption value="newUser" label="新客" />
            </ElSelect>
          </template>
        </ElFormItem>
        <ElFormItem label="活动时间" required>
          <ElDatePicker
            v-model="dateRange"
            type="datetimerange"
            value-format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
          />
        </ElFormItem>
        <ElFormItem label="启用">
          <ElSwitch v-model="form.enabled" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="loading" @click="onSave">保存</ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import {
    ElSwitch,
    ElButton,
    ElForm,
    ElFormItem,
    ElInput,
    ElSelect,
    ElOption,
    ElDatePicker,
    ElTag,
    ElMessage
  } from 'element-plus'
  import { opsApi } from '@/api/business'
  import type { BizPromotion, BizListParams, BizId } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const typeMap: Record<string, string> = {
    fullCut: '满减',
    discount: '折扣',
    group: '拼单',
    invite: '邀请',
    newUser: '新客'
  }
  function typeLabel(t?: string) {
    return t ? (typeMap[t] ?? t) : ''
  }

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '活动名' },
    {
      type: 'select' as const,
      field: 'type',
      label: '类型',
      options: [
        { value: 'fullCut', label: '满减' },
        { value: 'discount', label: '折扣' },
        { value: 'group', label: '拼单' },
        { value: 'invite', label: '邀请' },
        { value: 'newUser', label: '新客' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'name', label: '活动名', minWidth: 180 },
    { prop: 'type', label: '类型', width: 100, formatter: (_r, _c, v) => typeLabel(v as string) },
    {
      prop: 'startAt',
      label: '开始',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    },
    {
      prop: 'endAt',
      label: '结束',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    },
    { prop: 'enabled', label: '启用', width: 90, slot: 'cell-enabled' }
  ]

  function rowEnabled(row: unknown): boolean {
    return !!(row as { enabled?: boolean })?.enabled
  }

  async function onToggle(row: unknown, v: boolean) {
    const p = row as unknown as BizPromotion
    try {
      await opsApi.promotionToggle(p.id, v)
      ElMessage.success(v ? '已启用' : '已停用')
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    }
  }

  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)
  const currentId = ref<BizId | null>(null)
  const form = reactive<Partial<BizPromotion>>({
    name: '',
    type: 'fullCut',
    startAt: '',
    endAt: '',
    enabled: true
  })
  const dateRange = ref<[string, string] | null>(null)

  function onCreate() {
    editing.value = false
    currentId.value = null
    Object.assign(form, { name: '', type: 'fullCut', startAt: '', endAt: '', enabled: true })
    dateRange.value = null
    editVisible.value = true
  }

  const rowActions: BizRowAction[] = [
    {
      label: '编辑',
      type: 'primary',
      onClick: (row) => {
        const p = row as unknown as BizPromotion
        editing.value = true
        currentId.value = p.id
        Object.assign(form, { name: p.name, type: p.type, enabled: p.enabled })
        dateRange.value = [p.startAt, p.endAt]
        editVisible.value = true
      }
    }
  ]

  async function onSave() {
    if (!form.name) {
      ElMessage.warning('请输入活动名称')
      return
    }
    if (dateRange.value) {
      form.startAt = dateRange.value[0]
      form.endAt = dateRange.value[1]
    }
    if (!form.startAt || !form.endAt) {
      ElMessage.warning('请选择活动时间')
      return
    }
    loading.value = true
    try {
      if (editing.value && currentId.value) {
        await opsApi.promotionUpdate(currentId.value, form)
      } else {
        await opsApi.promotionSave(form)
      }
      ElMessage.success('已保存')
      editVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
    } finally {
      loading.value = false
    }
  }

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      type: params.type
    }
    const resp = await opsApi.promotionList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-ops-promotion {
    padding: 12px;
  }
</style>
