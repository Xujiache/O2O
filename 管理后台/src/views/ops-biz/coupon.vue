<!--
  P8 优惠券（V8.23）
  - 优惠券模板 CRUD
  - 数据：领取量 / 核销率 / 拉动 GMV
  - 批量发放策略：手动 / 触发式
-->
<template>
  <div class="biz-ops-coupon">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增模板</ElButton>
      </template>
    </BizTable>

    <BizModal
      v-model="editVisible"
      :title="editing ? '编辑优惠券' : '新增优惠券'"
      width="700px"
      :show-footer="false"
    >
      <ElForm :model="form" label-width="100px">
        <ElFormItem label="名称" required>
          <ElInput v-model="form.templateName" />
        </ElFormItem>
        <ElFormItem label="类型">
          <ElRadioGroup v-model="form.type">
            <ElRadio value="platform">平台</ElRadio>
            <ElRadio value="shop">店铺</ElRadio>
            <ElRadio value="rider">骑手</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="券面额" required>
          <ElInputNumber
            v-model="amountInput"
            :min="0"
            :step="0.01"
            :precision="2"
            controls-position="right"
          />
        </ElFormItem>
        <ElFormItem label="使用门槛">
          <ElInputNumber
            v-model="thresholdInput"
            :min="0"
            :step="0.01"
            :precision="2"
            controls-position="right"
          />
        </ElFormItem>
        <ElFormItem label="发放总量" required>
          <ElInputNumber v-model="form.totalQuota" :min="1" :step="100" />
        </ElFormItem>
        <ElFormItem label="有效期" required>
          <ElDatePicker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始"
            end-placeholder="结束"
          />
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
  import { ref, reactive, computed } from 'vue'
  import {
    ElForm,
    ElFormItem,
    ElInput,
    ElInputNumber,
    ElRadioGroup,
    ElRadio,
    ElDatePicker,
    ElButton,
    ElMessage,
    ElMessageBox
  } from 'element-plus'
  import { opsApi } from '@/api/business'
  import type { BizCoupon, BizListParams, BizId } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { formatAmount, fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '名称' },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: '草稿' },
        { value: 1, label: '已发布' },
        { value: 2, label: '已暂停' },
        { value: 3, label: '已结束' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'templateName', label: '名称', minWidth: 180 },
    { prop: 'type', label: '类型', width: 100 },
    {
      prop: 'amount',
      label: '面额',
      width: 100,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'thresholdAmount',
      label: '门槛',
      width: 100,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    { prop: 'totalQuota', label: '总量', width: 100, align: 'right' },
    { prop: 'issuedCount', label: '已发', width: 100, align: 'right' },
    { prop: 'usedCount', label: '已用', width: 100, align: 'right' },
    { prop: 'status', label: '状态', width: 100, statusType: 'COUPON_STATUS' },
    {
      prop: 'endAt',
      label: '结束时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)
  const currentId = ref<BizId | null>(null)
  const form = reactive<Partial<BizCoupon>>({
    templateName: '',
    type: 'platform',
    amount: '0',
    thresholdAmount: '0',
    totalQuota: 1000,
    startAt: '',
    endAt: '',
    status: 0
  })
  const amountInput = computed({
    get: () => Number(form.amount || 0),
    set: (v: number) => (form.amount = v.toFixed(2))
  })
  const thresholdInput = computed({
    get: () => Number(form.thresholdAmount || 0),
    set: (v: number) => (form.thresholdAmount = v.toFixed(2))
  })
  const dateRange = ref<[string, string] | null>(null)

  function onCreate() {
    editing.value = false
    Object.assign(form, {
      templateName: '',
      type: 'platform',
      amount: '0',
      thresholdAmount: '0',
      totalQuota: 1000,
      startAt: '',
      endAt: '',
      status: 0
    })
    dateRange.value = null
    currentId.value = null
    editVisible.value = true
  }

  const rowActions: BizRowAction[] = [
    {
      label: '编辑',
      type: 'primary',
      onClick: (row) => {
        const c = row as unknown as BizCoupon
        editing.value = true
        currentId.value = c.id
        Object.assign(form, c)
        dateRange.value = [c.startAt, c.endAt]
        editVisible.value = true
      }
    },
    {
      label: '发放',
      type: 'success',
      onClick: async (row) => {
        const c = row as unknown as BizCoupon
        await ElMessageBox.confirm(`确认向所有用户批量发放「${c.templateName}」?`, '提示', {
          type: 'success'
        })
        await opsApi.couponBatchIssue(c.id, { strategy: 'all' })
        ElMessage.success('已加入发放队列')
      }
    },
    {
      label: '暂停',
      type: 'warning',
      hidden: (row) => (row as unknown as BizCoupon).status !== 1,
      onClick: async (row) => {
        const c = row as unknown as BizCoupon
        await opsApi.couponPause(c.id)
        ElMessage.success('已暂停')
        tableRef.value?.reload()
      }
    }
  ]

  async function onSave() {
    if (!form.templateName) {
      ElMessage.warning('请填写名称')
      return
    }
    if (dateRange.value) {
      form.startAt = dateRange.value[0]
      form.endAt = dateRange.value[1]
    }
    loading.value = true
    try {
      if (editing.value && currentId.value) {
        await opsApi.couponUpdate(currentId.value, form)
      } else {
        await opsApi.couponSave(form)
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
      status: params.status
    }
    const resp = await opsApi.couponList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-ops-coupon {
    padding: 12px;
  }
</style>
