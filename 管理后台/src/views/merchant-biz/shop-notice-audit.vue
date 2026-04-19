<!--
  P8 店铺公告审核（V8.10）
  - 待审核公告列表
  - 通过 / 驳回（驳回必填原因）
-->
<template>
  <div class="biz-shop-notice-audit">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #cell-content="{ row }">
        <ElPopover trigger="hover" placement="top" width="320">
          <template #reference>
            <span class="notice-snippet">{{ noticeSnippet(row) }}</span>
          </template>
          <div class="notice-full">{{ noticeContent(row) }}</div>
        </ElPopover>
      </template>
    </BizTable>

    <BizModal v-model="rejectVisible" title="驳回公告" :show-footer="false">
      <ElForm :model="rejectForm" label-width="80px">
        <ElFormItem label="驳回原因" required>
          <ElInput v-model="rejectForm.reason" type="textarea" :rows="4" placeholder="必填" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="rejectVisible = false">取消</ElButton>
        <ElButton type="danger" :disabled="!rejectForm.reason" :loading="loading" @click="onReject">
          确认驳回
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import {
    ElMessage,
    ElMessageBox,
    ElForm,
    ElFormItem,
    ElInput,
    ElButton,
    ElPopover
  } from 'element-plus'
  import { shopApi } from '@/api/business'
  import type { BizShop, BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '店铺名 / 公告内容' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'name', label: '店铺名', minWidth: 160 },
    { prop: 'cityName', label: '城市', width: 80 },
    { prop: 'notice', label: '公告内容', minWidth: 220, slot: 'cell-content' },
    { prop: 'noticeAuditStatus', label: '审核状态', width: 110, statusType: 'NOTICE_AUDIT_STATUS' }
  ]

  const rejectVisible = ref(false)
  const loading = ref(false)
  const currentShop = ref<BizShop | null>(null)
  const rejectForm = reactive({ reason: '' })

  const rowActions: BizRowAction[] = [
    {
      label: '通过',
      type: 'success',
      hidden: (row) => (row as unknown as BizShop).noticeAuditStatus !== 0,
      onClick: async (row) => {
        const s = row as unknown as BizShop
        await ElMessageBox.confirm(`确认通过「${s.name}」公告?`, '提示', { type: 'success' })
        await shopApi.noticePass(s.id)
        ElMessage.success('已通过')
        tableRef.value?.reload()
      }
    },
    {
      label: '驳回',
      type: 'danger',
      hidden: (row) => (row as unknown as BizShop).noticeAuditStatus !== 0,
      onClick: (row) => {
        currentShop.value = row as unknown as BizShop
        rejectForm.reason = ''
        rejectVisible.value = true
      }
    }
  ]

  function noticeSnippet(row: unknown): string {
    const s = (row as { notice?: string })?.notice || '-'
    return s.length > 40 ? s.slice(0, 40) + '…' : s
  }
  function noticeContent(row: unknown): string {
    return (row as { notice?: string })?.notice || ''
  }

  async function onReject() {
    if (!currentShop.value || !rejectForm.reason) return
    loading.value = true
    try {
      await shopApi.noticeReject(currentShop.value.id, rejectForm.reason)
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
    const resp = await shopApi.noticeAuditList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-shop-notice-audit {
    padding: 12px;
  }

  .notice-snippet {
    cursor: pointer;
  }

  .notice-full {
    max-height: 240px;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.6;
    color: var(--el-text-color-regular);
  }
</style>
