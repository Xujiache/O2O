<!--
  P8 商品分类（V8.20 子项）
-->
<template>
  <div class="biz-product-category">
    <ElCard shadow="hover">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <span>商品分类</span>
          <ElButton type="primary" @click="onCreate">新增</ElButton>
        </div>
      </template>
      <ElTable :data="categories" border size="small">
        <ElTableColumn prop="id" label="ID" width="100" />
        <ElTableColumn prop="name" label="名称" min-width="200">
          <template #default="{ row }">
            <ElInput v-if="row.editing" v-model="row.tmpName" size="small" />
            <span v-else>{{ row.name }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="180">
          <template #default="{ row }">
            <template v-if="row.editing">
              <ElButton type="primary" size="small" link @click="onSave(row)">保存</ElButton>
              <ElButton size="small" link @click="row.editing = false">取消</ElButton>
            </template>
            <template v-else>
              <ElButton type="primary" size="small" link @click="onEdit(row)">编辑</ElButton>
              <ElButton type="danger" size="small" link @click="onDelete(row)">删除</ElButton>
            </template>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <BizModal v-model="createVisible" title="新增分类" :show-footer="false">
      <ElForm :model="createForm" label-width="80px">
        <ElFormItem label="名称" required>
          <ElInput v-model="createForm.name" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="createVisible = false">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="!createForm.name"
          :loading="loading"
          @click="onCreateConfirm"
        >
          确认
        </ElButton>
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
    ElInput,
    ElButton,
    ElForm,
    ElFormItem,
    ElMessage,
    ElMessageBox
  } from 'element-plus'
  import { productApi } from '@/api/business'
  import type { BizId } from '@/types/business'
  import { BizModal } from '@/components/biz'

  interface CategoryRow {
    id: BizId
    name: string
    editing?: boolean
    tmpName?: string
  }

  const categories = ref<CategoryRow[]>([])
  const createVisible = ref(false)
  const loading = ref(false)
  const createForm = reactive({ name: '' })

  async function load() {
    const data = (await productApi.categoryList()) as Array<{ id: BizId; name: string }>
    categories.value = data.map((c) => ({ ...c }))
  }

  function onCreate() {
    createForm.name = ''
    createVisible.value = true
  }

  async function onCreateConfirm() {
    if (!createForm.name) return
    loading.value = true
    try {
      await productApi.categoryCreate(createForm.name)
      ElMessage.success('已新增')
      createVisible.value = false
      load()
    } catch (e) {
      ElMessage.error((e as Error)?.message || '操作失败')
    } finally {
      loading.value = false
    }
  }

  function onEdit(row: CategoryRow) {
    row.tmpName = row.name
    row.editing = true
  }

  async function onSave(row: CategoryRow) {
    if (!row.tmpName) return
    try {
      await productApi.categoryUpdate(row.id, row.tmpName)
      row.name = row.tmpName
      row.editing = false
      ElMessage.success('已保存')
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败')
    }
  }

  async function onDelete(row: CategoryRow) {
    await ElMessageBox.confirm(`确认删除分类「${row.name}」?`, '提示', { type: 'warning' })
    await productApi.categoryDelete(row.id)
    ElMessage.success('已删除')
    load()
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-product-category {
    padding: 12px;
  }
</style>
