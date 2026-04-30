<!--
  P8 商户入驻审核（V8.8）
  - 待审核列表 + 状态筛选
  - 资质图片预览
  - 通过/驳回（驳回必填原因）
-->
<template>
  <div class="biz-merchant-audit">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    />

    <BizModal v-model="rejectVisible" title="驳回审核" :show-footer="false">
      <ElForm :model="rejectForm" label-width="80px">
        <ElFormItem label="驳回原因" required>
          <ElInput
            v-model="rejectForm.reason"
            type="textarea"
            :rows="4"
            placeholder="请填写驳回原因（必填，将通知商户）"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="rejectVisible = false">取消</ElButton>
        <ElButton
          v-biz-auth="'biz:merchant:audit'"
          type="danger"
          :loading="loading"
          :disabled="!rejectForm.reason"
          @click="onReject"
        >
          确认驳回
        </ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import { ElMessage, ElMessageBox, ElForm, ElFormItem, ElInput, ElButton } from 'element-plus'
  import { merchantApi } from '@/api/business'
  import type { BizMerchant, BizListParams } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '商户名 / 联系人' },
    {
      type: 'select' as const,
      field: 'status',
      label: '审核状态',
      options: [
        { value: 0, label: '待审核' },
        { value: 1, label: '已通过' },
        { value: 2, label: '已驳回' },
        { value: 3, label: '资料补充中' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'name', label: '商户名', minWidth: 160 },
    { prop: 'contact', label: '联系人', width: 100 },
    { prop: 'mobile', label: '手机号', width: 140 },
    { prop: 'cityName', label: '城市', width: 80 },
    { prop: 'auditStatus', label: '审核状态', width: 100, statusType: 'MERCHANT_AUDIT_STATUS' },
    {
      prop: 'createdAt',
      label: '提交时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const rejectVisible = ref(false)
  const loading = ref(false)
  const currentMerchant = ref<BizMerchant | null>(null)
  const rejectForm = reactive({ reason: '' })

  const rowActions: BizRowAction[] = [
    {
      label: '通过',
      type: 'success',
      hidden: (row) => (row as unknown as BizMerchant).auditStatus !== 0,
      onClick: async (row) => {
        const m = row as unknown as BizMerchant
        await ElMessageBox.confirm(`确认通过商户「${m.name}」入驻审核?`, '提示', {
          type: 'success',
          confirmButtonText: '通过'
        })
        await merchantApi.auditPass(m.id)
        ElMessage.success('已通过')
        tableRef.value?.reload()
      }
    },
    {
      label: '驳回',
      type: 'danger',
      hidden: (row) => (row as unknown as BizMerchant).auditStatus !== 0,
      onClick: (row) => {
        currentMerchant.value = row as unknown as BizMerchant
        rejectForm.reason = ''
        rejectVisible.value = true
      }
    }
  ]

  async function onReject() {
    if (!currentMerchant.value || !rejectForm.reason) return
    loading.value = true
    try {
      await merchantApi.auditReject(currentMerchant.value.id, rejectForm.reason)
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
    const next: BizListParams & { status?: number } = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      status: params.status as number | undefined
    }
    const resp = await merchantApi.auditList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-merchant-audit {
    padding: 12px;
  }
</style>
