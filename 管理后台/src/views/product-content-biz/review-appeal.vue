<!--
  P8 差评申诉
  - 申诉列表 + 审核通过/驳回
-->
<template>
  <div class="biz-review-appeal">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />

    <BizModal v-model="judgeVisible" title="申诉审核" :show-footer="false">
      <ElForm :model="judgeForm" label-width="90px">
        <ElFormItem label="结果" required>
          <ElRadioGroup v-model="judgeForm.result">
            <ElRadio value="pass">通过</ElRadio>
            <ElRadio value="reject">驳回</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput v-model="judgeForm.remark" type="textarea" :rows="4" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="judgeVisible = false">取消</ElButton>
        <ElButton type="primary" :disabled="!judgeForm.result" :loading="loading" @click="onJudge">
          确认
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import {
    ElButton,
    ElForm,
    ElFormItem,
    ElInput,
    ElMessage,
    ElRadio,
    ElRadioGroup
  } from 'element-plus'
  import { reviewApi } from '@/api/business'
  import type { BizListParams, BizReview } from '@/types/business'
  import { BizModal, BizTable } from '@/components/biz'
  import type { BizRowAction, BizTableColumn } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const judgeVisible = ref(false)
  const loading = ref(false)
  const currentRow = ref<BizReview | null>(null)
  const judgeForm = reactive<{ result: 'pass' | 'reject' | ''; remark: string }>({
    result: '',
    remark: ''
  })

  const searchSchema = [
    {
      type: 'input' as const,
      field: 'keyword',
      label: '关键词',
      placeholder: '订单号 / 用户 / 店铺'
    },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: '待审核' },
        { value: 1, label: '已通过' },
        { value: 2, label: '已驳回' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'orderNo', label: '订单号', width: 180 },
    { prop: 'userNickname', label: '用户', width: 120 },
    { prop: 'shopName', label: '店铺', minWidth: 160 },
    { prop: 'rating', label: '评分', width: 80, align: 'right' },
    { prop: 'content', label: '评价内容', minWidth: 220 },
    { prop: 'appealStatus', label: '申诉状态', width: 100, statusType: 'APPEAL_STATUS' },
    {
      prop: 'createdAt',
      label: '评价时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rowActions: BizRowAction[] = [
    {
      label: '审核',
      type: 'primary',
      onClick: (row) => {
        currentRow.value = row as unknown as BizReview
        judgeForm.result = ''
        judgeForm.remark = ''
        judgeVisible.value = true
      }
    }
  ]

  async function onJudge() {
    if (!currentRow.value || !judgeForm.result) return
    loading.value = true
    try {
      await reviewApi.appealJudge(currentRow.value.id, {
        result: judgeForm.result,
        remark: judgeForm.remark || undefined
      })
      ElMessage.success('已审核')
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
    const resp = await reviewApi.appealList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-review-appeal {
    padding: 12px;
  }
</style>
