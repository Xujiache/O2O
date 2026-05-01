/**
 * 业务路由：系统管理（业务侧）
 *
 * @module router/modules/business/system-biz
 */
import type { AppRouteRecord } from '@/types/router'

export const bizSystemRoutes: AppRouteRecord = {
  name: 'BizSystemBizRoot',
  path: '/biz/system',
  component: '/index/index',
  meta: {
    title: 'biz.menu.systemBiz.root',
    icon: 'ri:settings-3-line',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'admin',
      name: 'BizSystemAdmin',
      component: '/system-biz/admin',
      meta: { title: 'biz.menu.systemBiz.admin', icon: 'ri:admin-line' }
    },
    {
      path: 'role',
      name: 'BizSystemRole',
      component: '/system-biz/role',
      meta: { title: 'biz.menu.systemBiz.role', icon: 'ri:user-settings-line' }
    },
    {
      path: 'permission',
      name: 'BizSystemPermission',
      component: '/system-biz/permission',
      meta: { title: 'biz.menu.systemBiz.permission', icon: 'ri:shield-keyhole-line' }
    },
    {
      path: 'dict',
      name: 'BizSystemDict',
      component: '/system-biz/dict',
      meta: { title: 'biz.menu.systemBiz.dict', icon: 'ri:book-open-line' }
    },
    {
      path: 'operation-log',
      name: 'BizSystemOperationLog',
      component: '/system-biz/operation-log',
      meta: { title: 'biz.menu.systemBiz.operationLog', icon: 'ri:history-line' }
    },
    {
      path: 'api-log',
      name: 'BizSystemApiLog',
      component: '/system-biz/api-log',
      meta: { title: 'biz.menu.systemBiz.apiLog', icon: 'ri:terminal-line' }
    },
    {
      path: 'system-config',
      name: 'BizSystemSystemConfig',
      component: '/system-biz/system-config',
      meta: { title: 'biz.menu.systemBiz.systemConfig', icon: 'ri:settings-4-line' }
    },
    {
      path: 'app-config',
      name: 'BizSystemAppConfig',
      component: '/system-biz/app-config',
      meta: { title: 'biz.menu.systemBiz.appConfig', icon: 'ri:smartphone-line' }
    },
    {
      /* P9 Sprint 3 / W3.B.2：DLQ 监控（死信队列重试 / 丢弃） */
      path: 'dlq-monitor',
      name: 'BizSystemDlqMonitor',
      component: '/system-biz/dlq-monitor',
      meta: { title: 'biz.menu.systemBiz.dlqMonitor', icon: 'ri:error-warning-line' }
    }
  ]
}
