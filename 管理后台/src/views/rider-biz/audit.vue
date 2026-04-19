<!--
  P8 骑手入驻审核（V8.12，复用商户审核模式）
-->
<template>
  <div class="biz-rider-audit">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #cell-mobile="{ row }">{{ maskMobile(rowMobile(row)) }}</template>
    </BizTable>

    <BizModal v-model="rejectVisible" title="驳回审核" :show-footer="false">
      <ElForm :model="rejectForm" label-width="80px">
        <ElFormItem label="驳回原因" required>
          <ElInput v-model="rejectForm.reason" type="textarea" :rows="4" />
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
  import { ElMessage, ElMessageBox, ElForm, ElFormItem, ElInput, ElButton } from 'element-plus'
  import { riderApi } from '@/api/business'
  import type { BizRider, BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { maskMobile, fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '姓名 / 手机' },
    {
      type: 'select' as const,
      field: 'cityCode',
      label: '城市',
      options: [
        { value: '110100', label: '北京' },
        { value: '310100', label: '上海' },
        { value: '440100', label: '广州' },
        { value: '440300', label: '深圳' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'realName', label: '姓名', width: 100 },
    { prop: 'mobile', label: '手机', width: 140, slot: 'cell-mobile' },
    { prop: 'cityName', label: '城市', width: 80 },
    { prop: 'auditStatus', label: '审核', width: 100, statusType: 'RIDER_AUDIT_STATUS' },
    {
      prop: 'createdAt',
      label: '提交时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rejectVisible = ref(false)
  const loading = ref(false)
  const currentRider = ref<BizRider | null>(null)
  const rejectForm = reactive({ reason: '' })

  function rowMobile(row: unknown): string {
    return (row as { mobile?: string })?.mobile || ''
  }

  const rowActions: BizRowAction[] = [
    {
      label: '通过',
      type: 'success',
      hidden: (row) => (row as unknown as BizRider).auditStatus !== 0,
      onClick: async (row) => {
        const r = row as unknown as BizRider
        await ElMessageBox.confirm(`确认通过骑手「${r.realName}」入驻审核?`, '提示', {
          type: 'success'
        })
        await riderApi.auditPass(r.id)
        ElMessage.success('已通过')
        tableRef.value?.reload()
      }
    },
    {
      label: '驳回',
      type: 'danger',
      hidden: (row) => (row as unknown as BizRider).auditStatus !== 0,
      onClick: (row) => {
        currentRider.value = row as unknown as BizRider
        rejectForm.reason = ''
        rejectVisible.value = true
      }
    }
  ]

  async function onReject() {
    if (!currentRider.value || !rejectForm.reason) return
    loading.value = true
    try {
      await riderApi.auditReject(currentRider.value.id, rejectForm.reason)
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
      keyword: params.keyword as string,
      cityCode: params.cityCode as string
    }
    const resp = await riderApi.auditList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-rider-audit {
    padding: 12px;
  }
</style>
