<!--
  P8 角色管理（业务侧）
  - 列表 + 新增/编辑
-->
<template>
  <div class="biz-system-role">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="code"
    >
      <template #actions>
        <ElButton v-biz-auth="'biz:system:role:create'" type="primary" @click="onCreate"
          >新增角色</ElButton
        >
      </template>
    </BizTable>

    <BizModal v-model="editVisible" :title="editing ? '编辑角色' : '新增角色'" :show-footer="false">
      <ElForm :model="form" label-width="90px">
        <ElFormItem label="角色编码" required>
          <ElInput v-model="form.code" :disabled="editing" />
        </ElFormItem>
        <ElFormItem label="角色名称" required>
          <ElInput v-model="form.name" />
        </ElFormItem>
        <ElFormItem label="描述">
          <ElInput v-model="form.description" type="textarea" :rows="4" />
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
  import type { BizListParams, Role } from '@/types/business'
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
      placeholder: '角色编码 / 角色名称'
    }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'code', label: '角色编码', width: 180 },
    { prop: 'name', label: '角色名称', minWidth: 180 },
    { prop: 'description', label: '描述', minWidth: 220 },
    {
      prop: 'enabled',
      label: '状态',
      width: 100,
      formatter: (_r, _c, v) => ((v as boolean) ? '启用' : '禁用')
    }
  ]

  const form = reactive<Partial<Role>>({ code: '', name: '', description: '', enabled: true })

  function onCreate() {
    editing.value = false
    currentCode.value = ''
    Object.assign(form, { code: '', name: '', description: '', enabled: true })
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
        await systemApi.roleUpdate(currentCode.value, form)
      } else {
        await systemApi.roleSave(form)
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
    const resp = await systemApi.roleList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-system-role {
    padding: 12px;
  }
</style>
