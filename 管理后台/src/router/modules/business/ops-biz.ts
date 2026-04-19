/**
 * 业务路由：运营管理
 *
 * @module router/modules/business/ops-biz
 */
import type { AppRouteRecord } from '@/types/router'

export const bizOpsRoutes: AppRouteRecord = {
  name: 'BizOpsRoot',
  path: '/biz/ops',
  component: '/index/index',
  meta: {
    title: 'biz.menu.ops.root',
    icon: 'ri:rocket-2-line',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'coupon',
      name: 'BizOpsCoupon',
      component: '/ops-biz/coupon',
      meta: { title: 'biz.menu.ops.coupon', icon: 'ri:coupon-3-line' }
    },
    {
      path: 'promotion',
      name: 'BizOpsPromotion',
      component: '/ops-biz/promotion',
      meta: { title: 'biz.menu.ops.promotion', icon: 'ri:price-tag-line' }
    },
    {
      path: 'push',
      name: 'BizOpsPush',
      component: '/ops-biz/push',
      meta: { title: 'biz.menu.ops.push', icon: 'ri:notification-3-line' }
    },
    {
      path: 'push-template',
      name: 'BizOpsPushTemplate',
      component: '/ops-biz/push-template',
      meta: { title: 'biz.menu.ops.pushTemplate', icon: 'ri:layout-2-line' }
    },
    {
      path: 'region',
      name: 'BizOpsRegion',
      component: '/ops-biz/region',
      meta: { title: 'biz.menu.ops.region', icon: 'ri:map-pin-line' }
    }
  ]
}
