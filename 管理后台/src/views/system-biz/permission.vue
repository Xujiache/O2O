<!--
  P8 权限管理（业务侧）
  - 列表 + 新增/编辑
-->
<template>
  <div class="biz-system-permission">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="code"
    >
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增权限</ElButton>
      </template>
    </BizTable>

    <BizModal v-model="editVisible" :title="editing ? '编辑权限' : '新增权限'" :show-footer="false">
      <ElForm :model="form" label-width="90px">
        <ElFormItem label="权限编码" required>
          <ElInput v-model="form.code" :disabled="editing" />
        </ElFormItem>
        <ElFormItem label="权限名称" required>
          <ElInput v-model="form.name" />
        </ElFormItem>
        <ElFormItem label="权限类型">
          <ElSelect v-model="form.type">
            <ElOption label="菜单" value="menu" />
            <ElOption label="按钮" value="button" />
            <ElOption label="接口" value="api" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="父级编码">
          <ElInput v-model="form.parentCode" />
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
  import {
    ElButton,
    ElForm,
    ElFormItem,
    ElInput,
    ElMessage,
    ElOption,
    ElSelect
  } from 'element-plus'
  import { systemApi } from '@/api/business'
  import type { BizListParams, Permission } from '@/types/business'
  import { BizModal, BizTable } from '@/components/biz'
  import type { BizTableColumn } from '@/components/biz/BizTable.vue'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)
  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)
  const currentCode = ref<string>('')

  const searchSchema = [
    {
      type: 'input' as const,
      field: 'keyword',
      label: '关键词',
      placeholder: '权限编码 / 权限名称'
    },
    {
      type: 'select' as const,
      field: 'type',
      label: '类型',
      options: [
        { value: 'menu', label: '菜单' },
        { value: 'button', label: '按钮' },
        { value: 'api', label: '接口' }
      ]
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'code', label: '权限编码', minWidth: 220 },
    { prop: 'name', label: '权限名称', minWidth: 180 },
    { prop: 'type', label: '类型', width: 100 },
    { prop: 'parentCode', label: '父级编码', minWidth: 180 }
  ]

  const form = reactive<Partial<Permission>>({ code: '', name: '', type: 'menu', parentCode: '' })

  function onCreate() {
    editing.value = false
    currentCode.value = ''
    Object.assign(form, { code: '', name: '', type: 'menu', parentCode: '' })
    editVisible.value = true
  }

  async function onSave() {
    if (!form.code || !form.name) {
      ElMessage.warning('请完整填写')
      return
    }
    loading.value = true
    try {
      if (editing.value && currentCode.value) {
        await systemApi.permUpdate(currentCode.value, form)
      } else {
        await systemApi.permSave(form)
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
      keyword: params.keyword as string,
      type: params.type
    }
    const resp = await systemApi.permList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-system-permission {
    padding: 12px;
  }
</style>
