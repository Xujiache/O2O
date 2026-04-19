<!--
  BizExport 业务导出按钮
  - 默认：< 1000 同步 xlsx 直出
  - ≥ 1000：调 BizExportJobStore 走异步任务 + Notification 提示
  - 支持取消
-->
<template>
  <ElButton :type="type" :size="size" :loading="busy" :disabled="disabled" @click="onClick">
    <template #icon>
      <ElIcon><Download /></ElIcon>
    </template>
    <slot>{{ $t('biz.common.export') }}</slot>
  </ElButton>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { ElButton, ElIcon, ElMessage } from 'element-plus'
  import { Download } from '@element-plus/icons-vue'
  import { exportSyncXlsx } from '@/utils/business/export-async'
  import { useBizExportJobStore } from '@/store/modules/business'

  /** 同步导出 fetch 函数：返回所有可导出的数据 */
  type SyncFetcher<T> = () => Promise<T[]>

  const props = withDefaults(
    defineProps<{
      /** 业务名（导出任务名 + 文件名前缀） */
      name: string
      /** 业务模块（异步导出 module） */
      module: string
      /** 数据总量（用于判断同步 / 异步） */
      total: number
      /** 同步导出阈值（默认 1000） */
      threshold?: number
      /** < 阈值时调用：同步获取所有数据返回 */
      syncFetch?: SyncFetcher<Record<string, unknown>>
      /** ≥ 阈值时传给后端的过滤参数 */
      filters?: Record<string, unknown>
      /** 按钮类型 */
      type?: 'primary' | 'default' | 'success' | 'warning' | 'danger' | 'info'
      size?: 'large' | 'default' | 'small'
      disabled?: boolean
    }>(),
    {
      threshold: 1000,
      syncFetch: undefined,
      filters: () => ({}),
      type: 'primary',
      size: 'default',
      disabled: false
    }
  )

  const busy = ref(false)
  const exportJobStore = useBizExportJobStore()

  const isAsync = computed(() => props.total >= props.threshold)

  async function onClick() {
    if (busy.value) return
    busy.value = true
    try {
      if (isAsync.value) {
        const filename = `${props.name}-${Date.now()}.xlsx`
        await exportJobStore.startJob({
          module: props.module,
          filters: props.filters,
          name: props.name,
          total: props.total
        })
        ElMessage.success(`${props.name} 已加入导出队列`)
        // filename 仅用于业务侧追踪日志
        void filename
      } else if (props.syncFetch) {
        const rows = await props.syncFetch()
        const filename = `${props.name}-${Date.now()}.xlsx`
        exportSyncXlsx(rows, filename, props.name.slice(0, 30))
        ElMessage.success('已下载')
      } else {
        ElMessage.warning('未配置同步导出函数')
      }
    } catch (e) {
      ElMessage.error((e as Error)?.message || '导出失败')
    } finally {
      busy.value = false
    }
  }
</script>
