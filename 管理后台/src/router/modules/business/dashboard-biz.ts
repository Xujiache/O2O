/**
 * 业务路由：数据大盘
 *
 * @module router/modules/business/dashboard-biz
 */
import type { AppRouteRecord } from '@/types/router'

export const bizDashboardRoutes: AppRouteRecord = {
  name: 'BizDashboardRoot',
  path: '/biz/dashboard',
  component: '/index/index',
  meta: {
    title: 'biz.menu.dashboard.root',
    icon: 'ri:pie-chart-line',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'overview',
      name: 'BizDashboardOverview',
      component: '/dashboard-biz/overview',
      meta: { title: 'biz.menu.dashboard.overview', icon: 'ri:dashboard-3-line', keepAlive: false }
    },
    {
      path: 'trend',
      name: 'BizDashboardTrend',
      component: '/dashboard-biz/trend',
      meta: { title: 'biz.menu.dashboard.trend', icon: 'ri:line-chart-line', keepAlive: true }
    },
    {
      path: 'ops',
      name: 'BizDashboardOps',
      component: '/dashboard-biz/ops',
      meta: { title: 'biz.menu.dashboard.ops', icon: 'ri:bar-chart-2-line', keepAlive: true }
    },
    {
      path: 'monitor',
      name: 'BizDashboardMonitor',
      component: '/dashboard-biz/monitor',
      meta: { title: 'biz.menu.dashboard.monitor', icon: 'ri:radar-line', keepAlive: false }
    }
  ]
}
