<!--
  P8 工单管理（V8.52 R1 补齐）
  - 工单列表 + 分派 + 回复 + 关闭
-->
<template>
  <div class="biz-cs-ticket">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />

    <BizModal v-model="assignVisible" title="分派工单" :show-footer="false">
      <ElForm :model="assignForm" label-width="80px">
        <ElFormItem label="客服" required>
          <ElInput v-model="assignForm.assigneeAdminId" placeholder="客服管理员 ID" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="assignVisible = false">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="!assignForm.assigneeAdminId"
          :loading="loading"
          @click="onAssign"
        >
          确认分派
        </ElButton>
      </template>
    </BizModal>

    <BizModal v-model="closeVisible" title="关闭工单" :show-footer="false">
      <ElForm :model="closeForm" label-width="80px">
        <ElFormItem label="备注">
          <ElInput v-model="closeForm.remark" type="textarea" :rows="4" placeholder="可选" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="closeVisible = false">取消</ElButton>
        <ElButton type="danger" :loading="loading" @click="onClose">确认关闭</ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import { ElForm, ElFormItem, ElInput, ElButton, ElMessage } from 'element-plus'
  import { csApi } from '@/api/business'
  import type { BizTicket, BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '工单内容 / 报告人' },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: '待处理' },
        { value: 1, label: '处理中' },
        { value: 2, label: '已关闭' },
        { value: 3, label: '已升级' }
      ]
    },
    {
      type: 'select' as const,
      field: 'category',
      label: '类别',
      options: [
        { value: '配送投诉', label: '配送投诉' },
        { value: '商品质量', label: '商品质量' },
        { value: '客服建议', label: '客服建议' },
        { value: '账户问题', label: '账户问题' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'orderNo', label: '关联订单', width: 200 },
    { prop: 'reporter', label: '报告人', width: 120 },
    { prop: 'reporterRole', label: '角色', width: 80 },
    { prop: 'category', label: '类别', width: 120 },
    { prop: 'content', label: '内容', minWidth: 200 },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      formatter: (_r, _c, v) =>
        ({ 0: '待处理', 1: '处理中', 2: '已关闭', 3: '已升级' })[v as number] || '-'
    },
    { prop: 'assignee', label: '处理人', width: 120 },
    {
      prop: 'createdAt',
      label: '创建时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const assignVisible = ref(false)
  const closeVisible = ref(false)
  const loading = ref(false)
  const currentRow = ref<BizTicket | null>(null)
  const assignForm = reactive({ assigneeAdminId: '' })
  const closeForm = reactive({ remark: '' })

  const rowActions: BizRowAction[] = [
    {
      label: '分派',
      type: 'primary',
      hidden: (row) => (row as unknown as BizTicket).status >= 2,
      onClick: (row) => {
        currentRow.value = row as unknown as BizTicket
        assignForm.assigneeAdminId = ''
        assignVisible.value = true
      }
    },
    {
      label: '关闭',
      type: 'danger',
      hidden: (row) => (row as unknown as BizTicket).status >= 2,
      onClick: (row) => {
        currentRow.value = row as unknown as BizTicket
        closeForm.remark = ''
        closeVisible.value = true
      }
    }
  ]

  async function onAssign() {
    if (!currentRow.value || !assignForm.assigneeAdminId) return
    loading.value = true
    try {
      await csApi.ticketAssign(currentRow.value.id, assignForm.assigneeAdminId)
      ElMessage.success('已分派')
      assignVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    } finally {
      loading.value = false
    }
  }

  async function onClose() {
    if (!currentRow.value) return
    loading.value = true
    try {
      await csApi.ticketClose(currentRow.value.id, closeForm.remark)
      ElMessage.success('已关闭')
      closeVisible.value = false
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
      category: params.category
    }
    const resp = await csApi.ticketList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-cs-ticket {
    padding: 12px;
  }
</style>
