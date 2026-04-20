<!--
  P8 评价管理（V8.22）
  - 列表 + 隐藏 / 删除（违规评价）
-->
<template>
  <div class="biz-review-list">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />

    <BizModal v-model="actionVisible" :title="actionTitle" :show-footer="false">
      <ElForm :model="actionForm" label-width="80px">
        <ElFormItem label="原因" required>
          <ElInput v-model="actionForm.reason" type="textarea" :rows="4" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="actionVisible = false">取消</ElButton>
        <ElButton
          type="danger"
          :disabled="!actionForm.reason"
          :loading="loading"
          @click="onActionConfirm"
        >
          确认
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed } from 'vue'
  import { ElForm, ElFormItem, ElInput, ElButton, ElMessage } from 'element-plus'
  import { reviewApi } from '@/api/business'
  import type { BizReview, BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '订单号 / 用户' },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: '正常' },
        { value: 1, label: '已隐藏' },
        { value: 2, label: '已删除' },
        { value: 3, label: '申诉中' }
      ]
    },
    {
      type: 'select' as const,
      field: 'rating',
      label: '评分',
      options: [
        { value: 1, label: '1 星' },
        { value: 2, label: '2 星' },
        { value: 3, label: '3 星' },
        { value: 4, label: '4 星' },
        { value: 5, label: '5 星' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'orderNo', label: '订单号', width: 200 },
    { prop: 'userNickname', label: '用户', width: 120 },
    { prop: 'shopName', label: '店铺', minWidth: 160 },
    { prop: 'rating', label: '评分', width: 80, align: 'right' },
    { prop: 'content', label: '内容', minWidth: 200 },
    { prop: 'status', label: '状态', width: 100, statusType: 'REVIEW_STATUS' },
    {
      prop: 'createdAt',
      label: '时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const actionVisible = ref(false)
  const actionMode = ref<'hide' | 'delete'>('hide')
  const loading = ref(false)
  const currentRow = ref<BizReview | null>(null)
  const actionForm = reactive({ reason: '' })
  const actionTitle = computed(() => (actionMode.value === 'hide' ? '隐藏评价' : '删除评价'))

  const rowActions: BizRowAction[] = [
    {
      label: '隐藏',
      type: 'warning',
      hidden: (row) => (row as unknown as BizReview).status !== 0,
      onClick: (row) => {
        currentRow.value = row as unknown as BizReview
        actionMode.value = 'hide'
        actionForm.reason = ''
        actionVisible.value = true
      }
    },
    {
      label: '删除',
      type: 'danger',
      hidden: (row) => (row as unknown as BizReview).status === 2,
      onClick: (row) => {
        currentRow.value = row as unknown as BizReview
        actionMode.value = 'delete'
        actionForm.reason = ''
        actionVisible.value = true
      }
    }
  ]

  async function onActionConfirm() {
    if (!currentRow.value || !actionForm.reason) return
    loading.value = true
    try {
      if (actionMode.value === 'hide') {
        await reviewApi.hide(currentRow.value.id, actionForm.reason)
      } else {
        await reviewApi.remove(currentRow.value.id, actionForm.reason)
      }
      ElMessage.success('已操作')
      actionVisible.value = false
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
      status: params.status,
      rating: params.rating
    }
    const resp = await reviewApi.list(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-review-list {
    padding: 12px;
  }
</style>
