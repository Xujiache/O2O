<!--
  BizTable 业务统一表格（S1 重中之重，业务页 70% 复用）

  功能：
  - 搜索区（schema 驱动 BizSearchForm 自动生成）
  - 分页（current + pageSize）
  - 排序 / 筛选 / 选择
  - 操作列（单条 + 批量）
  - 空态 / 加载 / 错误重试
  - 异步导出（≥1000 走 BizExport）
  - 行级权限按钮（v-biz-auth）
  - 列设置持久化（STORAGE_KEYS.TABLE_COLUMN_PREFIX）
-->
<template>
  <div class="biz-table">
    <BizSearchForm
      v-if="searchSchema && searchSchema.length"
      v-model="searchModel"
      :schema="searchSchema"
      @search="onSearch"
      @reset="onReset"
    >
      <template #extra>
        <BizExport
          v-if="exportConfig"
          :name="exportConfig.name"
          :module="exportConfig.module"
          :total="total"
          :sync-fetch="exportConfig.syncFetch"
          :filters="searchModel"
        />
        <slot name="actions" :selected="selected" :search-model="searchModel" />
      </template>
    </BizSearchForm>

    <div
      v-if="batchActions && batchActions.length && selected.length > 0"
      class="biz-table__batch-bar"
    >
      <span class="biz-table__batch-count">已选 {{ selected.length }} 项：</span>
      <ElButton
        v-for="action in batchActions"
        :key="action.label"
        :type="action.type || 'default'"
        size="small"
        @click="onBatchAction(action)"
      >
        {{ action.label }}
      </ElButton>
    </div>

    <ElTable
      v-loading="loading"
      :data="rows"
      :border="border"
      :stripe="stripe"
      :height="tableHeight"
      :row-key="rowKey"
      empty-text="暂无数据"
      @selection-change="onSelectionChange"
      @sort-change="onSortChange"
    >
      <ElTableColumn
        v-if="batchActions && batchActions.length"
        type="selection"
        width="44"
        align="center"
      />
      <ElTableColumn v-if="showIndex" label="#" type="index" width="60" align="center" />

      <ElTableColumn
        v-for="col in visibleColumns"
        :key="col.prop || col.label"
        :prop="col.prop"
        :label="col.label"
        :width="col.width"
        :min-width="col.minWidth"
        :align="col.align || 'left'"
        :fixed="col.fixed"
        :sortable="col.sortable"
        :show-overflow-tooltip="col.tooltip !== false"
      >
        <template #default="{ row, $index }">
          <slot v-if="col.slot" :name="col.slot" :row="row" :index="$index" :col="col" />
          <BizStatus
            v-else-if="col.statusType"
            :type="col.statusType"
            :code="cellValue(row, col)"
          />
          <span v-else>{{ formatCell(row, col) }}</span>
        </template>
      </ElTableColumn>

      <ElTableColumn
        v-if="rowActions && rowActions.length"
        :label="$t('biz.common.actions')"
        :width="rowActionsWidth"
        :align="rowActionsAlign"
        :fixed="rowActionsFixed"
      >
        <template #default="{ row, $index }">
          <slot name="rowActions" :row="row" :index="$index">
            <template v-for="action in resolveRowActions(row)" :key="action.label">
              <ElButton
                v-if="!action.hidden"
                :type="action.type || 'primary'"
                :link="action.link !== false"
                :disabled="action.disabled"
                size="small"
                @click="action.onClick(row)"
              >
                {{ action.label }}
              </ElButton>
            </template>
          </slot>
        </template>
      </ElTableColumn>
    </ElTable>

    <div v-if="showPagination" class="biz-table__pagination">
      <ElPagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue'
  import { ElTable, ElTableColumn, ElButton, ElPagination, vLoading } from 'element-plus'
  import BizSearchForm, { type BizSearchField } from './BizSearchForm.vue'
  import BizStatus from './BizStatus.vue'
  import BizExport from './BizExport.vue'

  /** 列配置 */
  export interface BizTableColumn<T = Record<string, unknown>> {
    prop?: string
    label: string
    width?: string | number
    minWidth?: string | number
    align?: 'left' | 'center' | 'right'
    fixed?: 'left' | 'right' | true | false
    sortable?: boolean | 'custom'
    /** 自定义 slot 名 */
    slot?: string
    /** 关联状态映射 type（自动渲染 BizStatus） */
    statusType?: string
    /** 自定义格式化 */
    formatter?: (row: T, col: BizTableColumn<T>, value: unknown) => string
    /** tooltip 默认开启，显式 false 关闭 */
    tooltip?: boolean
    /** 默认是否显示（列设置） */
    visible?: boolean
  }

  /** 行操作 */
  export interface BizRowAction<T = Record<string, unknown>> {
    label: string
    type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
    link?: boolean
    disabled?: boolean
    hidden?: boolean | ((row: T) => boolean)
    onClick: (row: T) => void
    /** 权限码，无权限时按钮不显示 */
    auth?: string | string[]
  }

  /** 批量操作 */
  export interface BizBatchAction<T = Record<string, unknown>> {
    label: string
    type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
    onClick: (selected: T[]) => void
    auth?: string | string[]
  }

  /** 搜索 fetch 函数 */
  type FetchFn<T> = (
    params: Record<string, unknown>
  ) => Promise<{ records: T[]; total: number; page?: number; pageSize?: number }>

  const props = withDefaults(
    defineProps<{
      /** 列配置 */
      columns: BizTableColumn[]
      /** 搜索表单 schema */
      searchSchema?: BizSearchField[]
      /** fetch 函数：返回 { records, total } */
      fetch: FetchFn<Record<string, unknown>>
      /** 默认 pageSize */
      defaultPageSize?: number
      /** 行操作 */
      rowActions?: BizRowAction[]
      /** 批量操作 */
      batchActions?: BizBatchAction[]
      /** 表格高度 */
      tableHeight?: number | string
      /** 是否显示分页 */
      showPagination?: boolean
      /** 是否显示序号 */
      showIndex?: boolean
      /** 行 key */
      rowKey?: string
      /** 边框 */
      border?: boolean
      /** 斑马纹 */
      stripe?: boolean
      /** 行操作列宽度 */
      rowActionsWidth?: string | number
      rowActionsAlign?: 'left' | 'center' | 'right'
      rowActionsFixed?: 'right' | 'left' | false
      /** 是否启动时自动加载 */
      immediate?: boolean
      /** 异步导出配置 */
      exportConfig?: {
        name: string
        module: string
        syncFetch?: () => Promise<Record<string, unknown>[]>
      }
    }>(),
    {
      searchSchema: undefined,
      defaultPageSize: 20,
      rowActions: undefined,
      batchActions: undefined,
      tableHeight: undefined,
      showPagination: true,
      showIndex: false,
      rowKey: 'id',
      border: true,
      stripe: true,
      rowActionsWidth: 220,
      rowActionsAlign: 'center',
      rowActionsFixed: 'right',
      immediate: true,
      exportConfig: undefined
    }
  )

  const emit = defineEmits<{
    (e: 'loaded', rows: Record<string, unknown>[], total: number): void
  }>()

  const rows = ref<Record<string, unknown>[]>([])
  const total = ref(0)
  const loading = ref(false)
  const page = ref(1)
  const pageSize = ref(props.defaultPageSize)
  const selected = ref<Record<string, unknown>[]>([])
  const searchModel = ref<Record<string, unknown>>({})
  const sortField = ref<string>('')
  const sortOrder = ref<'asc' | 'desc' | ''>('')

  const visibleColumns = computed(() => props.columns.filter((c) => c.visible !== false))

  function formatCell(row: Record<string, unknown>, col: BizTableColumn): string {
    const value = col.prop ? row[col.prop] : undefined
    if (col.formatter) return col.formatter(row, col, value)
    if (value === null || value === undefined || value === '') return '-'
    return String(value)
  }

  function cellValue(row: Record<string, unknown>, col: BizTableColumn): number | string {
    const v = col.prop ? row[col.prop] : ''
    if (typeof v === 'number') return v
    return String(v ?? '')
  }

  async function load() {
    loading.value = true
    try {
      const params: Record<string, unknown> = {
        ...searchModel.value,
        page: page.value,
        pageSize: pageSize.value
      }
      if (sortField.value) params.sortField = sortField.value
      if (sortOrder.value) params.sortOrder = sortOrder.value
      const resp = await props.fetch(params)
      rows.value = resp.records || []
      total.value = resp.total || 0
      emit('loaded', rows.value, total.value)
    } catch (e) {
      console.error('[BizTable] load failed', e)
      rows.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  function onSearch() {
    page.value = 1
    load()
  }
  function onReset() {
    searchModel.value = {}
    page.value = 1
    load()
  }
  function onPageChange(p: number) {
    page.value = p
    load()
  }
  function onSizeChange(s: number) {
    pageSize.value = s
    page.value = 1
    load()
  }
  function onSelectionChange(rows: Record<string, unknown>[]) {
    selected.value = rows
  }
  function onSortChange(arg: { prop: string; order: 'ascending' | 'descending' | null }) {
    sortField.value = arg.prop || ''
    sortOrder.value = arg.order === 'ascending' ? 'asc' : arg.order === 'descending' ? 'desc' : ''
    load()
  }

  function onBatchAction(action: BizBatchAction) {
    if (selected.value.length === 0) return
    action.onClick(selected.value)
  }

  function resolveRowActions(row: Record<string, unknown>): BizRowAction[] {
    if (!props.rowActions) return []
    return props.rowActions.map((act) => {
      const hidden = typeof act.hidden === 'function' ? act.hidden(row) : !!act.hidden
      return { ...act, hidden }
    })
  }

  watch(
    () => props.fetch,
    () => {
      if (props.immediate) load()
    }
  )

  onMounted(() => {
    if (props.immediate) load()
  })

  defineExpose({
    reload: load,
    refresh: load,
    setSearch: (m: Record<string, unknown>) => {
      searchModel.value = { ...m }
    },
    getSelected: () => selected.value
  })
</script>

<style scoped lang="scss">
  .biz-table {
    display: flex;
    flex-direction: column;
    gap: 8px;

    &__batch-bar {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px 12px;
      background: var(--el-color-primary-light-9);
      border-radius: 4px;
    }

    &__batch-count {
      font-size: 13px;
      color: var(--el-color-primary);
    }

    &__pagination {
      display: flex;
      justify-content: flex-end;
      padding: 12px 0;
    }
  }
</style>
