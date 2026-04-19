/**
 * 业务路由：用户管理
 *
 * @module router/modules/business/user-biz
 */
import type { AppRouteRecord } from '@/types/router'

export const bizUserRoutes: AppRouteRecord = {
  name: 'BizUserRoot',
  path: '/biz/user',
  component: '/index/index',
  meta: {
    title: 'biz.menu.user.root',
    icon: 'ri:user-line',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'list',
      name: 'BizUserList',
      component: '/user-biz/list',
      meta: { title: 'biz.menu.user.list', icon: 'ri:contacts-line', keepAlive: true }
    },
    {
      path: 'detail/:id',
      name: 'BizUserDetail',
      component: '/user-biz/detail',
      meta: {
        title: '用户详情',
        icon: 'ri:user-search-line',
        isHide: true,
        isHideTab: true,
        activePath: '/biz/user/list'
      }
    },
    {
      path: 'risk',
      name: 'BizUserRisk',
      component: '/user-biz/risk',
      meta: { title: 'biz.menu.user.risk', icon: 'ri:alarm-warning-line', keepAlive: true }
    }
  ]
}
