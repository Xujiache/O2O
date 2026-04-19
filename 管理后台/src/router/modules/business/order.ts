/**
 * 业务路由：订单管理
 *
 * @module router/modules/business/order
 */
import type { AppRouteRecord } from '@/types/router'

export const bizOrderRoutes: AppRouteRecord = {
  name: 'BizOrderRoot',
  path: '/biz/order',
  component: '/index/index',
  meta: {
    title: 'biz.menu.order.root',
    icon: 'ri:list-check',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'list',
      name: 'BizOrderList',
      component: '/order-biz/list',
      meta: { title: 'biz.menu.order.list', icon: 'ri:file-list-3-line' }
    },
    {
      path: 'detail/:orderNo',
      name: 'BizOrderDetail',
      component: '/order-biz/detail',
      meta: {
        title: '订单详情',
        icon: 'ri:bill-line',
        isHide: true,
        isHideTab: true,
        activePath: '/biz/order/list'
      }
    },
    {
      path: 'cancel-refund-audit',
      name: 'BizOrderCancelRefundAudit',
      component: '/order-biz/cancel-refund-audit',
      meta: { title: 'biz.menu.order.cancelRefund', icon: 'ri:refund-2-line' }
    },
    {
      path: 'complaint',
      name: 'BizOrderComplaint',
      component: '/order-biz/complaint',
      meta: { title: 'biz.menu.order.complaint', icon: 'ri:feedback-line' }
    },
    {
      path: 'arbitration',
      name: 'BizOrderArbitration',
      component: '/order-biz/arbitration',
      meta: { title: 'biz.menu.order.arbitration', icon: 'ri:scales-3-line' }
    }
  ]
}
