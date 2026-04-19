/**
 * 业务路由：客服 + 风控
 *
 * @module router/modules/business/cs-risk
 */
import type { AppRouteRecord } from '@/types/router'

export const bizCsRiskRoutes: AppRouteRecord = {
  name: 'BizCsRiskRoot',
  path: '/biz/cs-risk',
  component: '/index/index',
  meta: {
    title: 'biz.menu.csRisk.root',
    icon: 'ri:shield-check-line',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'ticket',
      name: 'BizCsTicket',
      component: '/cs-risk-biz/ticket',
      meta: { title: 'biz.menu.csRisk.ticket', icon: 'ri:customer-service-2-line' }
    },
    {
      path: 'arbitration',
      name: 'BizCsArbitration',
      component: '/cs-risk-biz/arbitration',
      meta: { title: 'biz.menu.csRisk.arbitration', icon: 'ri:scales-3-line' }
    },
    {
      path: 'rule',
      name: 'BizRiskRuleView',
      component: '/cs-risk-biz/rule',
      meta: { title: 'biz.menu.csRisk.rule', icon: 'ri:shield-flash-line' }
    },
    {
      path: 'risk-order',
      name: 'BizRiskOrderView',
      component: '/cs-risk-biz/risk-order',
      meta: { title: 'biz.menu.csRisk.riskOrder', icon: 'ri:alarm-warning-line' }
    },
    {
      path: 'cheat',
      name: 'BizRiskCheat',
      component: '/cs-risk-biz/cheat',
      meta: { title: 'biz.menu.csRisk.cheat', icon: 'ri:spy-line' }
    },
    {
      path: 'record',
      name: 'BizRiskRecord',
      component: '/cs-risk-biz/record',
      meta: { title: 'biz.menu.csRisk.record', icon: 'ri:file-history-line' }
    }
  ]
}
