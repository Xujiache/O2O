<!--
  P8 订单仲裁 + 判定（V8.18 + V8.38）
  - 三方判定：用户 / 商户 / 骑手 / 平摊
  - 退款金额录入（compareAmount 严格校验）
-->
<template>
  <div class="biz-order-arbitration">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />

    <BizModal v-model="judgeVisible" title="仲裁判定" :show-footer="false" width="600px">
      <ElForm :model="judgeForm" label-width="100px">
        <ElFormItem label="订单号">{{ currentRow?.orderNo }}</ElFormItem>
        <ElFormItem label="申请方"
          >{{ currentRow?.applicantRole }} - {{ currentRow?.applicantName }}</ElFormItem
        >
        <ElFormItem label="原因">{{ currentRow?.reason }}</ElFormItem>
        <ElFormItem label="判定结果" required>
          <ElRadioGroup v-model="judgeForm.result">
            <ElRadio value="user">用户胜诉</ElRadio>
            <ElRadio value="merchant">商户胜诉</ElRadio>
            <ElRadio value="rider">骑手胜诉</ElRadio>
            <ElRadio value="split">三方平摊</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="退款金额">
          <ElInputNumber
            v-model="judgeForm.refundAmount"
            :min="0"
            :step="0.01"
            :precision="2"
            controls-position="right"
            style="width: 200px"
          />
          <span style="margin-left: 8px; color: var(--el-text-color-secondary)"
            >仅在退款时填写</span
          >
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput v-model="judgeForm.remark" type="textarea" :rows="3" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="judgeVisible = false">取消</ElButton>
        <ElButton type="primary" :disabled="!judgeForm.result" :loading="loading" @click="onJudge">
          确认判定
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import {
    ElForm,
    ElFormItem,
    ElInput,
    ElInputNumber,
    ElRadioGroup,
    ElRadio,
    ElButton,
    ElMessage
  } from 'element-plus'
  import { orderApi } from '@/api/business'
  import type { BizArbitration, BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '订单号 / 申请人' },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: '待受理' },
        { value: 1, label: '调查中' },
        { value: 2, label: '已判定' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'orderNo', label: '订单号', width: 200, fixed: 'left' },
    { prop: 'applicantRole', label: '申请方', width: 100 },
    { prop: 'applicantName', label: '申请人', width: 120 },
    { prop: 'reason', label: '原因', minWidth: 200 },
    { prop: 'status', label: '状态', width: 100, statusType: 'ARBITRATION_STATUS' },
    {
      prop: 'createdAt',
      label: '提交时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const judgeVisible = ref(false)
  const loading = ref(false)
  const currentRow = ref<BizArbitration | null>(null)
  const judgeForm = reactive<{
    result: 'user' | 'merchant' | 'rider' | 'split' | ''
    refundAmount: number
    remark: string
  }>({ result: '', refundAmount: 0, remark: '' })

  const rowActions: BizRowAction[] = [
    {
      label: '判定',
      type: 'primary',
      hidden: (row) => (row as unknown as BizArbitration).status >= 2,
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
      await orderApi.arbitrationJudge(currentRow.value.id, {
        result: judgeForm.result,
        refundAmount: judgeForm.refundAmount > 0 ? judgeForm.refundAmount.toFixed(2) : undefined,
        remark: judgeForm.remark
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
    const resp = await orderApi.arbitrationList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-order-arbitration {
    padding: 12px;
  }
</style>
