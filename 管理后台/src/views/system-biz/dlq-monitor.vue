<!--
  @file dlq-monitor.vue
  @stage P9 Sprint 3 / W3.B.2
  @desc DLQ 监控（管理后台）
    - 列表 + 状态/saga筛选 + 时间段
    - 操作：手动重试 / 丢弃
    - 权限：biz:system:dlq:view（列表）/ biz:system:dlq:retry（操作）
-->
<template>
  <div class="biz-system-dlq-monitor">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      :row-actions="rowActions"
      row-key="id"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { dlqApi, type DlqItem, type DlqListParams } from '@/api/business/dlq'
  import { BizTable } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: 'PENDING' },
        { value: 1, label: 'RETRY_OK' },
        { value: 2, label: 'PERMANENT_FAILED' },
        { value: 3, label: 'DISCARDED' }
      ]
    },
    {
      type: 'input' as const,
      field: 'sagaName',
      label: 'Saga',
      placeholder: 'OrderPaidSaga / RefundSucceedSaga ...'
    },
    {
      type: 'dateRange' as const,
      field: 'time',
      label: '时间段'
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 200 },
    { prop: 'sagaName', label: 'Saga', width: 200 },
    { prop: 'sagaId', label: 'Saga ID', width: 200 },
    { prop: 'eventName', label: '事件', width: 160 },
    { prop: 'failedStep', label: '失败步骤', width: 160 },
    {
      prop: 'statusText',
      label: '状态',
      width: 140,
      align: 'center'
    },
    { prop: 'retryCount', label: '已重试', width: 80, align: 'center' },
    {
      prop: 'nextRetryAt',
      label: '下次重试',
      width: 170,
      formatter: (_r, _c, v) => (v ? fmtDateTime(v as string) : '-')
    },
    { prop: 'lastError', label: '最近错误', minWidth: 220 },
    {
      prop: 'createdAt',
      label: '创建时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rowActions: BizRowAction[] = [
    {
      label: '重试',
      type: 'primary',
      auth: 'biz:system:dlq:retry',
      hidden: (row) => {
        const r = row as unknown as DlqItem
        return r.status === 1 /* RETRY_OK */ || r.status === 3 /* DISCARDED */
      },
      onClick: async (row) => {
        const r = row as unknown as DlqItem
        await ElMessageBox.confirm(`确认重试 saga=${r.sagaName} id=${r.sagaId}？`, '提示', {
          type: 'warning'
        })
        const resp = await dlqApi.retryDlq(r.id)
        if (resp.ok) {
          ElMessage.success(resp.message || '已投递重试队列')
          tableRef.value?.reload()
        } else {
          ElMessage.error(resp.message || '重试失败')
        }
      }
    },
    {
      label: '丢弃',
      type: 'danger',
      auth: 'biz:system:dlq:retry',
      hidden: (row) => {
        const r = row as unknown as DlqItem
        return r.status === 1 || r.status === 3
      },
      onClick: async (row) => {
        const r = row as unknown as DlqItem
        const { value: reason } = (await ElMessageBox.prompt(
          `丢弃理由（saga=${r.sagaName} id=${r.sagaId}）`,
          '丢弃 DLQ 记录',
          {
            inputPlaceholder: '请输入丢弃理由',
            inputValidator: (val: string) => !!val || '请输入理由',
            confirmButtonText: '丢弃',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )) as { value: string }
        const resp = await dlqApi.discardDlq(r.id, reason)
        if (resp.ok) {
          ElMessage.success(resp.message || '已丢弃')
          tableRef.value?.reload()
        } else {
          ElMessage.error(resp.message || '丢弃失败')
        }
      }
    }
  ]

  async function fetchList(params: Record<string, unknown>) {
    const time = params.time as [string, string] | undefined
    const next: DlqListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      status:
        params.status === undefined || params.status === '' ? undefined : Number(params.status),
      sagaName: params.sagaName as string | undefined,
      startAt: Array.isArray(time) ? time[0] : undefined,
      endAt: Array.isArray(time) ? time[1] : undefined
    }
    const resp = await dlqApi.getDlqList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-system-dlq-monitor {
    padding: 12px;
  }
</style>
