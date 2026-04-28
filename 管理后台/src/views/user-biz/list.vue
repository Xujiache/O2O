<!--
  P8 用户列表（V8.5）
  - 筛选：昵称 / 手机号 / 注册渠道 / 状态
  - 列：id / 昵称 / 手机(脱敏) / 渠道 / 订单数 / 消费总额 / 状态
  - 行操作：详情、封禁/解封
  - 批量封禁（V8.7：批量真循环 N 次）
-->
<template>
  <div class="biz-user-list">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
      :batch-actions="batchActions"
      :export-config="exportConfig"
    >
      <template #cell-mobile="{ row }">
        <span>{{ rowMobile(row) }}</span>
      </template>
    </BizTable>

    <BizConfirmDialog
      v-model="banVisible"
      title="封禁用户"
      :message="banMessage"
      hint="封禁后用户将无法登录，请输入「确认」继续"
      @confirm="onBanConfirm"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage } from 'element-plus'
  import { userApi } from '@/api/business'
  import type { BizUser, BizListParams } from '@/types/business'
  import { BizTable, BizConfirmDialog } from '@/components/biz'
  import type { BizTableColumn, BizRowAction, BizBatchAction } from '@/components/biz/BizTable.vue'
  import { maskMobile, formatAmount, fmtDateTime } from '@/utils/business/format'

  const router = useRouter()
  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '昵称 / 手机号' },
    {
      type: 'select' as const,
      field: 'channel',
      label: '注册渠道',
      options: [
        { value: 'mp', label: '小程序' },
        { value: 'app', label: 'APP' },
        { value: 'h5', label: 'H5' }
      ]
    },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 1, label: '正常' },
        { value: 2, label: '已封禁' }
      ]
    },
    { type: 'dateRange' as const, field: 'range', label: '注册时间' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'nickname', label: '昵称', minWidth: 120 },
    { prop: 'mobile', label: '手机号', width: 140, slot: 'cell-mobile' },
    { prop: 'channel', label: '渠道', width: 90 },
    { prop: 'orderCount', label: '订单数', width: 90, align: 'right' },
    {
      prop: 'totalSpend',
      label: '消费总额',
      width: 120,
      align: 'right',
      formatter: (_r, _c, v) => formatAmount(v as string)
    },
    {
      prop: 'registeredAt',
      label: '注册时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    },
    { prop: 'status', label: '状态', width: 100, statusType: 'USER_STATUS' }
  ]

  const asUser = (row: unknown): BizUser => row as unknown as BizUser

  const rowActions: BizRowAction[] = [
    {
      label: '详情',
      type: 'primary',
      onClick: (row) => router.push(`/biz/user/detail/${asUser(row).id}`)
    },
    {
      label: '封禁',
      type: 'danger',
      hidden: (row) => asUser(row).status === 2,
      onClick: (row) => {
        const u = asUser(row)
        currentUser.value = u
        banMessage.value = `即将封禁用户「${u.nickname}」（${maskMobile(u.mobile)}），封禁后用户立即无法登录。`
        banVisible.value = true
      }
    },
    {
      label: '解封',
      type: 'success',
      hidden: (row) => asUser(row).status !== 2,
      onClick: async (row) => {
        await userApi.unban(asUser(row).id)
        ElMessage.success('已解封')
        tableRef.value?.reload()
      }
    }
  ]

  const batchActions: BizBatchAction[] = [
    {
      label: '批量封禁',
      type: 'danger',
      onClick: async (selected) => {
        let ok = 0
        let fail = 0
        for (const item of selected) {
          const u = asUser(item)
          if (u.status === 2) continue
          try {
            await userApi.ban(u.id)
            ok++
          } catch {
            fail++
          }
        }
        ElMessage.success(`批量封禁完成：成功 ${ok}，失败 ${fail}`)
        tableRef.value?.reload()
      }
    }
  ]

  const banVisible = ref(false)
  const banMessage = ref('')
  const currentUser = ref<BizUser | null>(null)

  async function onBanConfirm() {
    if (!currentUser.value) return
    try {
      await userApi.ban(currentUser.value.id)
      ElMessage.success(`已封禁 ${currentUser.value.nickname}`)
      banVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '封禁失败')
    }
  }

  function rowMobile(row: unknown): string {
    return maskMobile((row as { mobile?: string })?.mobile)
  }

  async function fetchList(params: Record<string, unknown>) {
    const next: BizListParams = {
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 20,
      keyword: params.keyword as string,
      channel: params.channel as string,
      status: params.status as number,
      startTime: Array.isArray(params.range) ? (params.range[0] as string) : undefined,
      endTime: Array.isArray(params.range) ? (params.range[1] as string) : undefined
    }
    const resp = await userApi.list(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }

  async function syncFetch(): Promise<Record<string, unknown>[]> {
    const all = await userApi.list({ page: 1, pageSize: 9999 })
    return all.records.map((u) => ({
      id: u.id,
      昵称: u.nickname,
      手机号: maskMobile(u.mobile),
      渠道: u.channel,
      订单数: u.orderCount,
      消费总额: u.totalSpend,
      状态: u.status === 2 ? '已封禁' : '正常',
      注册时间: u.registeredAt
    }))
  }

  const exportConfig = {
    name: '用户列表',
    module: 'user',
    syncFetch
  }
</script>

<style scoped lang="scss">
  .biz-user-list {
    padding: 12px;
  }
</style>
