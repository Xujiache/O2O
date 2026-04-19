/**
 * 业务路由：骑手管理
 *
 * @module router/modules/business/rider
 */
import type { AppRouteRecord } from '@/types/router'

export const bizRiderRoutes: AppRouteRecord = {
  name: 'BizRiderRoot',
  path: '/biz/rider',
  component: '/index/index',
  meta: {
    title: 'biz.menu.rider.root',
    icon: 'ri:bike-line',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'audit',
      name: 'BizRiderAudit',
      component: '/rider-biz/audit',
      meta: { title: 'biz.menu.rider.audit', icon: 'ri:check-double-line' }
    },
    {
      path: 'list',
      name: 'BizRiderList',
      component: '/rider-biz/list',
      meta: { title: 'biz.menu.rider.list', icon: 'ri:contacts-line' }
    },
    {
      path: 'detail/:id',
      name: 'BizRiderDetail',
      component: '/rider-biz/detail',
      meta: {
        title: '骑手详情',
        icon: 'ri:user-search-line',
        isHide: true,
        isHideTab: true,
        activePath: '/biz/rider/list'
      }
    },
    {
      path: 'transfer-audit',
      name: 'BizRiderTransferAudit',
      component: '/rider-biz/transfer-audit',
      meta: { title: 'biz.menu.rider.transferAudit', icon: 'ri:exchange-line' }
    },
    {
      path: 'reward',
      name: 'BizRiderReward',
      component: '/rider-biz/reward',
      meta: { title: 'biz.menu.rider.reward', icon: 'ri:medal-line' }
    },
    {
      path: 'level-config',
      name: 'BizRiderLevelConfig',
      component: '/rider-biz/level-config',
      meta: { title: 'biz.menu.rider.levelConfig', icon: 'ri:vip-crown-line' }
    },
    {
      path: 'risk',
      name: 'BizRiderRisk',
      component: '/rider-biz/risk',
      meta: { title: 'biz.menu.rider.risk', icon: 'ri:alarm-warning-line' }
    }
  ]
}
