<!--
  P8 字典管理（V8.49 R1 补齐）
  - 字典组 CRUD + 前端缓存刷新按钮
-->
<template>
  <div class="biz-system-dict">
    <ElCard shadow="hover">
      <template #header>
        <div class="dict-header">
          <span>字典管理</span>
          <div>
            <ElButton type="warning" :loading="refreshing" @click="onRefreshCache">
              刷新前端缓存
            </ElButton>
            <ElButton type="primary" @click="onCreate">新增字典组</ElButton>
          </div>
        </div>
      </template>
      <ElTable :data="groups" border size="small" v-loading="loading">
        <ElTableColumn prop="type" label="类型编码" width="200" />
        <ElTableColumn prop="typeName" label="类型名称" width="200" />
        <ElTableColumn label="字典项" min-width="300">
          <template #default="{ row }">
            <ElTag
              v-for="item in (row as DictGroup).items.slice(0, 5)"
              :key="item.code"
              size="small"
              class="dict-tag"
            >
              {{ item.label }}（{{ item.value }}）
            </ElTag>
            <ElTag v-if="(row as DictGroup).items.length > 5" size="small" type="info">
              +{{ (row as DictGroup).items.length - 5 }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="160" align="center">
          <template #default="{ row }">
            <ElButton size="small" type="primary" link @click="onEdit(row as DictGroup)">
              编辑
            </ElButton>
            <ElButton size="small" type="danger" link @click="onDelete(row as DictGroup)">
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <BizModal
      v-model="editVisible"
      :title="editing ? '编辑字典组' : '新增字典组'"
      width="700px"
      :show-footer="false"
    >
      <ElForm :model="form" label-width="100px">
        <ElFormItem label="类型编码" required>
          <ElInput v-model="form.type" :disabled="editing" placeholder="如 ORDER_STATUS" />
        </ElFormItem>
        <ElFormItem label="类型名称" required>
          <ElInput v-model="form.typeName" placeholder="如 订单状态" />
        </ElFormItem>
        <ElFormItem label="字典项">
          <div v-for="(item, idx) in form.items" :key="idx" class="dict-item-row">
            <ElInput v-model="item.code" placeholder="编码" style="width: 120px" />
            <ElInput v-model="item.label" placeholder="显示名" style="width: 120px" />
            <ElInput v-model="item.value" placeholder="值" style="width: 100px" />
            <ElButton type="danger" link @click="form.items.splice(idx, 1)">删除</ElButton>
          </div>
          <ElButton
            type="primary"
            link
            @click="form.items.push({ code: '', value: '', label: '' })"
          >
            + 添加项
          </ElButton>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="onSave">保存</ElButton>
      </template>
    </BizModal>
  </div>
</template>

<script setup lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import {
    ElCard,
    ElTable,
    ElTableColumn,
    ElForm,
    ElFormItem,
    ElInput,
    ElButton,
    ElTag,
    ElMessage,
    ElMessageBox
  } from 'element-plus'
  import { systemApi } from '@/api/business'
  import type { DictGroup } from '@/types/business'
  import { BizModal } from '@/components/biz'

  const groups = ref<DictGroup[]>([])
  const loading = ref(false)
  const refreshing = ref(false)
  const editVisible = ref(false)
  const editing = ref(false)
  const saving = ref(false)
  const form = reactive<DictGroup>({
    type: '',
    typeName: '',
    items: []
  })

  async function load() {
    loading.value = true
    try {
      groups.value = await systemApi.dictList()
    } finally {
      loading.value = false
    }
  }

  async function onRefreshCache() {
    refreshing.value = true
    try {
      groups.value = await systemApi.dictAll()
      ElMessage.success('缓存已刷新')
    } finally {
      refreshing.value = false
    }
  }

  function onCreate() {
    editing.value = false
    Object.assign(form, { type: '', typeName: '', items: [] })
    editVisible.value = true
  }

  function onEdit(row: DictGroup) {
    editing.value = true
    Object.assign(form, { type: row.type, typeName: row.typeName, items: [...row.items] })
    editVisible.value = true
  }

  async function onSave() {
    if (!form.type || !form.typeName) {
      ElMessage.warning('请填写类型编码和名称')
      return
    }
    saving.value = true
    try {
      if (editing.value) {
        await systemApi.dictUpdate(form.type, form)
      } else {
        await systemApi.dictSave(form)
      }
      ElMessage.success('已保存')
      editVisible.value = false
      load()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
    } finally {
      saving.value = false
    }
  }

  async function onDelete(row: DictGroup) {
    await ElMessageBox.confirm(`确认删除「${row.typeName}」(${row.type})?`, '提示', {
      type: 'warning'
    })
    await systemApi.dictDelete(row.type)
    ElMessage.success('已删除')
    load()
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-system-dict {
    padding: 12px;
  }

  .dict-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dict-tag {
    margin-right: 4px;
    margin-bottom: 4px;
  }

  .dict-item-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }
</style>
