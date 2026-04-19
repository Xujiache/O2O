/**
 * 业务路由：商品与内容
 *
 * @module router/modules/business/product-content
 */
import type { AppRouteRecord } from '@/types/router'

export const bizProductContentRoutes: AppRouteRecord = {
  name: 'BizProductContentRoot',
  path: '/biz/product-content',
  component: '/index/index',
  meta: {
    title: 'biz.menu.productContent.root',
    icon: 'ri:shopping-bag-line',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'product/list',
      name: 'BizProductList',
      component: '/product-content-biz/product-list',
      meta: { title: 'biz.menu.productContent.productList', icon: 'ri:shopping-bag-3-line' }
    },
    {
      path: 'product/violation',
      name: 'BizProductViolation',
      component: '/product-content-biz/product-violation',
      meta: { title: 'biz.menu.productContent.productViolation', icon: 'ri:alert-line' }
    },
    {
      path: 'product/category',
      name: 'BizProductCategory',
      component: '/product-content-biz/product-category',
      meta: { title: 'biz.menu.productContent.productCategory', icon: 'ri:price-tag-3-line' }
    },
    {
      path: 'content/banner',
      name: 'BizContentBanner',
      component: '/product-content-biz/banner',
      meta: { title: 'biz.menu.productContent.banner', icon: 'ri:gallery-line' }
    },
    {
      path: 'content/quick-entry',
      name: 'BizContentQuickEntry',
      component: '/product-content-biz/quick-entry',
      meta: { title: 'biz.menu.productContent.quickEntry', icon: 'ri:apps-line' }
    },
    {
      path: 'content/hot-search',
      name: 'BizContentHotSearch',
      component: '/product-content-biz/hot-search',
      meta: { title: 'biz.menu.productContent.hotSearch', icon: 'ri:fire-line' }
    },
    {
      path: 'content/notice',
      name: 'BizContentNotice',
      component: '/product-content-biz/notice',
      meta: { title: 'biz.menu.productContent.notice', icon: 'ri:notification-2-line' }
    },
    {
      path: 'review/list',
      name: 'BizReviewList',
      component: '/product-content-biz/review-list',
      meta: { title: 'biz.menu.productContent.reviewList', icon: 'ri:chat-3-line' }
    },
    {
      path: 'review/appeal',
      name: 'BizReviewAppeal',
      component: '/product-content-biz/review-appeal',
      meta: { title: 'biz.menu.productContent.reviewAppeal', icon: 'ri:chat-quote-line' }
    }
  ]
}
