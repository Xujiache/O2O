<!--
  P8 客服仲裁（三方判定）
  - 复用客服仲裁接口
-->
<template>
  <div class="biz-cs-arbitration">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />

    <BizModal v-model="judgeVisible" title="仲裁判定" :show-footer="false">
      <ElForm :model="judgeForm" label-width="90px">
        <ElFormItem label="结果" required>
          <ElRadioGroup v-model="judgeForm.result">
            <ElRadio value="user">用户胜诉</ElRadio>
            <ElRadio value="merchant">商户胜诉</ElRadio>
            <ElRadio value="rider">骑手胜诉</ElRadio>
            <ElRadio value="split">平摊</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="退款金额">
          <ElInputNumber v-model="judgeForm.refundAmount" :min="0" :step="0.01" :precision="2" />
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput v-model="judgeForm.remark" type="textarea" :rows="4" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="judgeVisible = false">取消</ElButton>
        <ElButton type="primary" :disabled="!judgeForm.result" :loading="loading" @click="onJudge"
          >确认</ElButton
        >
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import {
    ElButton,
    ElForm,
    ElFormItem,
    ElInput,
    ElInputNumber,
    ElMessage,
    ElRadio,
    ElRadioGroup
  } from 'element-plus'
  import { csApi } from '@/api/business'
  import type { BizArbitration, BizListParams } from '@/types/business'
  import { BizModal, BizTable } from '@/components/biz'
  import type { BizRowAction, BizTableColumn } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const judgeVisible = ref(false)
  const loading = ref(false)
  const currentRow = ref<BizArbitration | null>(null)
  const judgeForm = reactive<{
    result: 'user' | 'merchant' | 'rider' | 'split' | ''
    refundAmount: number
    remark: string
  }>({ result: '', refundAmount: 0, remark: '' })

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '订单号 / 申请人' },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: '待处理' },
        { value: 1, label: '处理中' },
        { value: 2, label: '已判定' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'orderNo', label: '订单号', width: 180 },
    { prop: 'applicantRole', label: '申请方', width: 100 },
    { prop: 'applicantName', label: '申请人', width: 120 },
    { prop: 'reason', label: '原因', minWidth: 220 },
    { prop: 'status', label: '状态', width: 100, statusType: 'ARBITRATION_STATUS' },
    {
      prop: 'createdAt',
      label: '创建时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rowActions: BizRowAction[] = [
    {
      label: '判定',
      type: 'primary',
      onClick: (row) => {
        currentRow.value = row as unknown as BizArbitration
        judgeForm.result = ''
        judgeForm.refundAmount = 0
        judgeForm.remark = ''
        judgeVisible.value = true
      }
    }
  ]

  async function onJudge() {
    if (!currentRow.value || !judgeForm.result) return
    loading.value = true
    try {
      await csApi.arbitrationJudge(currentRow.value.id, {
        result: judgeForm.result,
        refundAmount: judgeForm.refundAmount > 0 ? judgeForm.refundAmount.toFixed(2) : undefined,
        remark: judgeForm.remark || undefined
      })
      ElMessage.success('已判定')
      judgeVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
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
    const resp = await csApi.arbitrationList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-cs-arbitration {
    padding: 12px;
  }
</style>
