/**
 * 业务组件 barrel + 全局批量注册
 *
 * @module components/biz
 */
import type { App } from 'vue'
import BizTable from './BizTable.vue'
import BizSearchForm from './BizSearchForm.vue'
import BizModal from './BizModal.vue'
import BizConfirmDialog from './BizConfirmDialog.vue'
import BizAuth from './BizAuth.vue'
import BizUpload from './BizUpload.vue'
import BizChart from './BizChart.vue'
import BizStatus from './BizStatus.vue'
import BizExport from './BizExport.vue'
import BizJsonViewer from './BizJsonViewer.vue'
import BizOrderFlow from './BizOrderFlow.vue'
import BizDateRange from './BizDateRange.vue'
import BizPolygonEditor from './BizPolygonEditor.vue'

export {
  BizTable,
  BizSearchForm,
  BizModal,
  BizConfirmDialog,
  BizAuth,
  BizUpload,
  BizChart,
  BizStatus,
  BizExport,
  BizJsonViewer,
  BizOrderFlow,
  BizDateRange,
  BizPolygonEditor
}

/**
 * 全局批量注册业务组件，main.ts 调用一次
 */
export function setupBizComponents(app: App): void {
  app.component('BizTable', BizTable)
  app.component('BizSearchForm', BizSearchForm)
  app.component('BizModal', BizModal)
  app.component('BizConfirmDialog', BizConfirmDialog)
  app.component('BizAuth', BizAuth)
  app.component('BizUpload', BizUpload)
  app.component('BizChart', BizChart)
  app.component('BizStatus', BizStatus)
  app.component('BizExport', BizExport)
  app.component('BizJsonViewer', BizJsonViewer)
  app.component('BizOrderFlow', BizOrderFlow)
  app.component('BizDateRange', BizDateRange)
  app.component('BizPolygonEditor', BizPolygonEditor)
}
