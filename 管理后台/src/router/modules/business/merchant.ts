/**
 * 业务路由：商户管理 + 店铺
 *
 * @module router/modules/business/merchant
 */
import type { AppRouteRecord } from '@/types/router'

export const bizMerchantRoutes: AppRouteRecord = {
  name: 'BizMerchantRoot',
  path: '/biz/merchant',
  component: '/index/index',
  meta: {
    title: 'biz.menu.merchant.root',
    icon: 'ri:store-line',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'audit',
      name: 'BizMerchantAudit',
      component: '/merchant-biz/audit',
      meta: { title: 'biz.menu.merchant.audit', icon: 'ri:check-double-line' }
    },
    {
      path: 'list',
      name: 'BizMerchantList',
      component: '/merchant-biz/list',
      meta: { title: 'biz.menu.merchant.list', icon: 'ri:list-check-2' }
    },
    {
      path: 'detail/:id',
      name: 'BizMerchantDetail',
      component: '/merchant-biz/detail',
      meta: {
        title: '商户详情',
        icon: 'ri:store-2-line',
        isHide: true,
        isHideTab: true,
        activePath: '/biz/merchant/list'
      }
    },
    {
      path: 'shop-list',
      name: 'BizShopList',
      component: '/merchant-biz/shop-list',
      meta: { title: 'biz.menu.shop.list', icon: 'ri:store-3-line' }
    },
    {
      path: 'risk',
      name: 'BizMerchantRisk',
      component: '/merchant-biz/risk',
      meta: { title: 'biz.menu.merchant.risk', icon: 'ri:alarm-warning-line' }
    }
  ]
}
