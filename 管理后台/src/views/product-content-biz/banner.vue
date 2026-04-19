<!--
  P8 Banner（V8.21）
  - CRUD + 图上传 + 排序 + 有效期 + 城市定向
-->
<template>
  <div class="biz-content-banner">
    <BizTable
      ref="tableRef"
      :columns="columns"
      :search-schema="searchSchema"
      :fetch="fetchList"
      row-key="id"
      :row-actions="rowActions"
    >
      <template #cell-img="{ row }">
        <ElImage
          :src="rowImg(row)"
          fit="cover"
          style="width: 120px; height: 40px; border-radius: 4px"
        />
      </template>
      <template #cell-enabled="{ row }">
        <ElTag v-if="(row as { enabled: boolean }).enabled" type="success">启用</ElTag>
        <ElTag v-else type="info">停用</ElTag>
      </template>
      <template #actions>
        <ElButton type="primary" @click="onCreate">新增 Banner</ElButton>
      </template>
    </BizTable>

    <BizModal
      v-model="editVisible"
      :title="editing ? '编辑 Banner' : '新增 Banner'"
      width="700px"
      :show-footer="false"
    >
      <ElForm :model="form" label-width="100px">
        <ElFormItem label="标题" required>
          <ElInput v-model="form.title" />
        </ElFormItem>
        <ElFormItem label="图片地址" required>
          <ElInput v-model="form.imgUrl" placeholder="可粘贴 URL 或上传 (上传需对接后端文件接口)" />
          <ElImage
            v-if="form.imgUrl"
            :src="form.imgUrl"
            fit="cover"
            style="width: 240px; height: 80px; margin-top: 4px; border-radius: 4px"
          />
        </ElFormItem>
        <ElFormItem label="跳转类型" required>
          <ElRadioGroup v-model="form.linkType">
            <ElRadio value="shop">店铺</ElRadio>
            <ElRadio value="product">商品</ElRadio>
            <ElRadio value="h5">H5</ElRadio>
            <ElRadio value="category">分类</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="跳转值" required>
          <ElInput v-model="form.linkValue" placeholder="店铺/商品 ID 或 H5 URL" />
        </ElFormItem>
        <ElFormItem label="城市">
          <ElInput v-model="form.cityCode" placeholder="留空表示全部城市" />
        </ElFormItem>
        <ElFormItem label="有效期">
          <ElDatePicker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始"
            end-placeholder="结束"
          />
        </ElFormItem>
        <ElFormItem label="排序">
          <ElInputNumber v-model="form.sort" :min="0" />
        </ElFormItem>
        <ElFormItem label="启用">
          <ElSwitch v-model="form.enabled" />
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
  import { ref, reactive } from 'vue'
  import {
    ElForm,
    ElFormItem,
    ElInput,
    ElInputNumber,
    ElRadioGroup,
    ElRadio,
    ElDatePicker,
    ElSwitch,
    ElButton,
    ElImage,
    ElTag,
    ElMessage,
    ElMessageBox
  } from 'element-plus'
  import { contentApi } from '@/api/business'
  import type { BizBanner, BizListParams, BizId } from '@/types/business'
  import { BizTable, BizModal } from '@/components/biz'
  import type { BizTableColumn, BizRowAction } from '@/components/biz/BizTable.vue'
  import { fmtDateTime } from '@/utils/business/format'

  const tableRef = ref<InstanceType<typeof BizTable> | null>(null)

  const searchSchema = [
    { type: 'input' as const, field: 'keyword', label: '关键词', placeholder: '标题' }
  ]

  const columns: BizTableColumn[] = [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'title', label: '标题', minWidth: 160 },
    { prop: 'imgUrl', label: '图片', width: 140, slot: 'cell-img' },
    { prop: 'linkType', label: '跳转类型', width: 100 },
    { prop: 'cityCode', label: '城市', width: 100 },
    { prop: 'sort', label: '排序', width: 80, align: 'right' },
    { prop: 'enabled', label: '启用', width: 80, slot: 'cell-enabled' },
    {
      prop: 'startAt',
      label: '开始时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    },
    {
      prop: 'endAt',
      label: '结束时间',
      width: 170,
      formatter: (_r, _c, v) => fmtDateTime(v as string)
    }
  ]

  function rowImg(row: unknown): string {
    return (row as { imgUrl?: string })?.imgUrl || ''
  }

  const editVisible = ref(false)
  const editing = ref(false)
  const loading = ref(false)
  const form = reactive<Partial<BizBanner>>({
    title: '',
    imgUrl: '',
    linkType: 'shop',
    linkValue: '',
    cityCode: '',
    sort: 1,
    enabled: true,
    startAt: '',
    endAt: ''
  })
  const dateRange = ref<[string, string] | null>(null)
  const currentId = ref<BizId | null>(null)

  function onCreate() {
    editing.value = false
    Object.assign(form, {
      title: '',
      imgUrl: '',
      linkType: 'shop',
      linkValue: '',
      cityCode: '',
      sort: 1,
      enabled: true,
      startAt: '',
      endAt: ''
    })
    dateRange.value = null
    currentId.value = null
    editVisible.value = true
  }

  const rowActions: BizRowAction[] = [
    {
      label: '编辑',
      type: 'primary',
      onClick: (row) => {
        const b = row as unknown as BizBanner
        editing.value = true
        currentId.value = b.id
        Object.assign(form, b)
        dateRange.value = b.startAt && b.endAt ? [b.startAt, b.endAt] : null
        editVisible.value = true
      }
    },
    {
      label: '删除',
      type: 'danger',
      onClick: async (row) => {
        const b = row as unknown as BizBanner
        await ElMessageBox.confirm(`确认删除「${b.title}」?`, '提示', { type: 'warning' })
        await contentApi.bannerDelete(b.id)
        ElMessage.success('已删除')
        tableRef.value?.reload()
      }
    }
  ]

  async function onSave() {
    if (!form.title || !form.imgUrl || !form.linkValue) {
      ElMessage.warning('请完整填写')
      return
    }
    if (dateRange.value) {
      form.startAt = dateRange.value[0]
      form.endAt = dateRange.value[1]
    }
    loading.value = true
    try {
      if (editing.value && currentId.value) {
        await contentApi.bannerUpdate(currentId.value, form)
      } else {
        await contentApi.bannerSave(form)
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
    const resp = await contentApi.bannerList(next)
    return {
      records: resp.records as unknown as Record<string, unknown>[],
      total: resp.total,
      page: resp.page,
      pageSize: resp.pageSize
    }
  }
</script>

<style scoped lang="scss">
  .biz-content-banner {
    padding: 12px;
  }
</style>
