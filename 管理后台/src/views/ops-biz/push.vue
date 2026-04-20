<!--
  P8 消息推送（V8.25）
  - 多通道：mp / app / sms / inbox
  - 定向：全部 / 城市 / 标签 / 用户
-->
<template>
  <div class="biz-ops-push">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增推送</ElButton>
      </template>
    </BizTable>

    <BizModal
      v-model="editVisible"
      :title="editing ? '编辑推送' : '新增推送'"
      width="700px"
      :show-footer="false"
    >
      <ElForm :model="form" label-width="100px">
        <ElFormItem label="标题" required>
          <ElInput v-model="form.title" />
        </ElFormItem>
        <ElFormItem label="模板编码">
          <ElSelect v-model="form.templateCode" placeholder="选择模板">
            <ElOption v-for="t in templates" :key="t.code" :value="t.code" :label="t.name" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="通道" required>
          <ElCheckboxGroup v-model="channelArr">
            <ElCheckbox value="mp">小程序订阅消息</ElCheckbox>
            <ElCheckbox value="app">APP 推送</ElCheckbox>
            <ElCheckbox value="sms">短信</ElCheckbox>
            <ElCheckbox value="inbox">站内信</ElCheckbox>
          </ElCheckboxGroup>
        </ElFormItem>
        <ElFormItem label="受众">
          <ElRadioGroup v-model="form.audience">
            <ElRadio value="all">全部</ElRadio>
            <ElRadio value="city">城市</ElRadio>
            <ElRadio value="tag">标签</ElRadio>
            <ElRadio value="user">用户</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="计划发送">
          <ElDatePicker
            v-model="form.scheduleAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            placeholder="留空立即发送"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="loading" @click="onSave">保存</ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, watch, onMounted } from 'vue'
  import {
    ElForm,
    ElFormItem,
    ElInput,
    ElSelect,
    ElOption,
    ElCheckboxGroup,
    ElCheckbox,
    ElRadioGroup,
    ElRadio,
    ElDatePicker,
    ElButton,
    ElMessage,
    ElMessageBox
  } from 'element-plus'
  import { opsApi } from '@/api/business'
  import type { BizPushTask, BizListParams, BizId } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const templates = ref<Array<{ id: BizId; code: string; name: string }>>([])

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '标题' },
    {
      type: 'select' as const,
      field: 'status',
      label: '状态',
      options: [
        { value: 0, label: '草稿' },
        { value: 1, label: '排队中' },
        { value: 2, label: '推送中' },
        { value: 3, label: '已完成' },
        { value: 4, label: '已取消' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'title', label: '标题', minWidth: 180 },
    {
      prop: 'channels',
      label: '通道',
      width: 200,
      formatter: (_r, _c, v) => (Array.isArray(v) ? (v as string[]).join(' / ') : '-')
    },
    { prop: 'audience', label: '受众', width: 100 },
    { prop: 'status', label: '状态', width: 110, statusType: 'PUSH_STATUS' },
    {
      prop: 'scheduleAt',
      label: '计划',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    },
    {
      prop: 'createdAt',
      label: '创建时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)
  const channelArr = ref<string[]>(['app'])
  const form = reactive<Partial<BizPushTask>>({
    title: '',
    templateCode: '',
    channels: ['app'],
    audience: 'all',
    scheduleAt: ''
  })
  watch(channelArr, (v) => {
    form.channels = v as BizPushTask['channels']
  })

  async function loadTemplates() {
    templates.value = (await opsApi.pushTemplateList()) as Array<{
      id: BizId
      code: string
      name: string
    }>
  }

  function onCreate() {
    editing.value = false
    Object.assign(form, {
      title: '',
      templateCode: '',
      channels: ['app'],
      audience: 'all',
      scheduleAt: ''
    })
    channelArr.value = ['app']
    editVisible.value = true
  }

  const rowActions: BizRowAction[] = [
    {
      label: '取消',
      type: 'danger',
      hidden: (row) => (row as unknown as BizPushTask).status >= 3,
      onClick: async (row) => {
        const t = row as unknown as BizPushTask
        await ElMessageBox.confirm(`确认取消推送 #${t.id}?`, '提示', { type: 'warning' })
        await opsApi.pushCancel(t.id)
        ElMessage.success('已取消')
        tableRef.value?.reload()
      }
    }
  ]

  async function onSave() {
    if (!form.title) {
      ElMessage.warning('请填写标题')
      return
    }
    loading.value = true
    try {
      await opsApi.pushSave(form)
      ElMessage.success('已保存')
      editVisible.value = false
      tableRef.value?.reload()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
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
    const resp = await opsApi.pushList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }

  onMounted(loadTemplates)
</script>

<style scoped lang="scss">
  .biz-ops-push {
    padding: 12px;
  }
</style>
