<!--
  P8 取消/退款审核（V8.18）
  - 待审核退款列表
  - 通过：录入退款金额（金额 100% currency.js compareAmount）
  - 驳回：必填原因
-->
<template>
  <div class="biz-order-cancel-refund-audit">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="orderNo"
      :row-actions="rowActions"
    >
      <template #cell-mobile="{ row }">{{ maskMobile(rowMobile(row)) }}</template>
    </BizTable>

    <BizModal v-model="passVisible" title="通过退款" :show-footer="false">
      <ElForm :model="passForm" label-width="100px">
        <ElFormItem label="订单号">{{ currentOrder?.orderNo }}</ElFormItem>
        <ElFormItem label="订单金额">{{ formatAmount(currentOrder?.amountTotal) }}</ElFormItem>
        <ElFormItem label="退款金额" required>
          <ElInputNumber
            v-model="passForm.amount"
            :min="0"
            :max="currentOrder ? currency(currentOrder.amountTotal).value : 0"
            :step="0.01"
            :precision="2"
            controls-position="right"
            style="width: 200px"
          />
          <span style="margin-left: 8px; color: var(--el-text-color-secondary)"
            >不可超过订单金额</span
          >
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="passVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="loading" :disabled="!validPassForm" @click="onPass">
          确认
        </ElButton>
      </template>
    </BizModal>

    <BizModal v-model="rejectVisible" title="驳回退款" :show-footer="false">
      <ElForm :model="rejectForm" label-width="80px">
        <ElFormItem label="驳回原因" required>
          <ElInput v-model="rejectForm.reason" type="textarea" :rows="4" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="rejectVisible = false">取消</ElButton>
        <ElButton type="danger" :loading="loading" :disabled="!rejectForm.reason" @click="onReject">
          确认驳回
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, computed } from 'vue'
  import { ElForm, ElFormItem, ElInput, ElInputNumber, ElButton, ElMessage } from 'element-plus'
  import { orderApi } from '@/api/business'
  import type { BizOrder, BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import currency from 'currency.js'
  import { maskMobile, formatAmount, fmtDateTime, compareAmount } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '订单号 / 手机号' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'orderNo', label: '订单号', width: 200, fixed: 'left' },
    { prop: 'userMobile', label: '用户', width: 140, slot: 'cell-mobile' },
    {
      prop: 'amountTotal',
      label: '订单金额',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'createdAt',
      label: '下单时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const passVisible = ref(false)
  const rejectVisible = ref(false)
  const loading = ref(false)
  const currentOrder = ref<BizOrder | null>(null)
  const passForm = reactive({ amount: 0 })
  const rejectForm = reactive({ reason: '' })

  const validPassForm = computed(() => {
    if (!currentOrder.value) return false
    return (
      compareAmount(passForm.amount, 0) > 0 &&
      compareAmount(passForm.amount, currentOrder.value.amountTotal) <= 0
    )
  })

  function rowMobile(row: unknown): string {
    return (row as { userMobile?: string })?.userMobile || ''
  }

  const rowActions: BizRowAction[] = [
    {
      label: '通过',
      type: 'success',
      onClick: (row) => {
        currentOrder.value = row as unknown as BizOrder
        passForm.amount = currency(currentOrder.value.amountTotal).value
        passVisible.value = true
      }
    },
    {
      label: '驳回',
      type: 'danger',
      onClick: (row) => {
        currentOrder.value = row as unknown as BizOrder
        rejectForm.reason = ''
        rejectVisible.value = true
      }
    }
  ]

  async function onPass() {
    if (!currentOrder.value || !validPassForm.value) return
    loading.value = true
    try {
      await orderApi.cancelRefundPass(currentOrder.value.orderNo, passForm.amount.toFixed(2))
      ElMessage.success('已通过')
      passVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    } finally {
      loading.value = false
    }
  }

  async function onReject() {
    if (!currentOrder.value || !rejectForm.reason) return
    loading.value = true
    try {
      await orderApi.cancelRefundReject(currentOrder.value.orderNo, rejectForm.reason)
      ElMessage.success('已驳回')
      rejectVisible.value = false
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
      keyword: params.keyword as string
    }
    const resp = await orderApi.cancelRefundAuditList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-order-cancel-refund-audit {
    padding: 12px;
  }
</style>
