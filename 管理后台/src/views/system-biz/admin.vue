<!--
  P8 管理员管理
  - 列表 + 新增/编辑
-->
<template>
  <div class="biz-system-admin">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
    >
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增管理员</ElButton>
      </template>
    </BizTable>

    <BizModal
      v-model="editVisible"
      :title="editing ? '编辑管理员' : '新增管理员'"
      :show-footer="false"
    >
      <ElForm :model="form" label-width="90px">
        <ElFormItem label="用户名" required>
          <ElInput v-model="form.username" />
        </ElFormItem>
        <ElFormItem label="姓名" required>
          <ElInput v-model="form.realName" />
        </ElFormItem>
        <ElFormItem label="邮箱">
          <ElInput v-model="form.email" />
        </ElFormItem>
        <ElFormItem label="手机">
          <ElInput v-model="form.mobile" />
        </ElFormItem>
        <ElFormItem v-if="!editing" label="密码" required>
          <ElInput v-model="form.password" type="password" show-password />
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
  import { reactive, ref } from 'vue'
  import { ElButton, ElForm, ElFormItem, ElInput, ElMessage } from 'element-plus'
  import { systemApi } from '@/api/business'
  import type { BizAdmin, BizId, BizListParams } from '@/types/business'
  import { BizModal, BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'
  import { fmtDateTime, maskMobile } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)
  const currentId = ref<BizId | null>(null)

  const searchSchema = [
    {
      type: 'input' as const,
      field: 'keyword',
      label: '关键词',
      placeholder: '用户名 / 姓名 / 邮箱'
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 90 },
    { prop: 'username', label: '用户名', width: 140 },
    { prop: 'realName', label: '姓名', width: 140 },
    { prop: 'email', label: '邮箱', minWidth: 180 },
    {
      prop: 'mobile',
      label: '手机',
      width: 140,
      formatter: (_r, _c, v) => maskMobile(v as string)
    },
    {
      prop: 'roles',
      label: '角色',
      minWidth: 180,
      formatter: (_r, _c, v) => (Array.isArray(v) ? (v as string[]).join(' / ') : '-')
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 100,
      formatter: (_r, _c, v) => ((v as boolean) ? '启用' : '禁用')
    },
    {
      prop: 'createdAt',
      label: '创建时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  const form = reactive<Partial<BizAdmin> & { password?: string }>({
    username: '',
    realName: '',
    email: '',
    mobile: '',
    enabled: true,
    roles: [],
    password: ''
  })

  function onCreate() {
    editing.value = false
    currentId.value = null
    Object.assign(form, {
      username: '',
      realName: '',
      email: '',
      mobile: '',
      enabled: true,
      roles: [],
      password: ''
    })
    editVisible.value = true
  }

  async function onSave() {
    if (!form.username || !form.realName || (!editing.value && !form.password)) {
      ElMessage.warning('请完整填写')
      return
    }
    loading.value = true
    try {
      if (editing.value && currentId.value) {
        await systemApi.adminUpdate(currentId.value, form)
      } else {
        await systemApi.adminSave(form)
      }
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
      keyword: params.keyword as string
    }
    const resp = await systemApi.adminList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-system-admin {
    padding: 12px;
  }
</style>
