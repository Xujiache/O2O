/**
 * 业务路由：财务管理
 *
 * @module router/modules/business/finance
 */
import type { AppRouteRecord } from '@/types/router'

export const bizFinanceRoutes: AppRouteRecord = {
  name: 'BizFinanceRoot',
  path: '/biz/finance',
  component: '/index/index',
  meta: {
    title: 'biz.menu.finance.root',
    icon: 'ri:money-cny-circle-line',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'overview',
      name: 'BizFinanceOverview',
      component: '/finance-biz/overview',
      meta: { title: 'biz.menu.finance.overview', icon: 'ri:line-chart-line' }
    },
    {
      path: 'settlement-rule',
      name: 'BizFinanceSettlementRule',
      component: '/finance-biz/settlement-rule',
      meta: { title: 'biz.menu.finance.settlementRule', icon: 'ri:settings-2-line' }
    },
    {
      path: 'settlement-record',
      name: 'BizFinanceSettlementRecord',
      component: '/finance-biz/settlement-record',
      meta: { title: 'biz.menu.finance.settlementRecord', icon: 'ri:file-list-line' }
    },
    {
      path: 'withdraw-audit',
      name: 'BizFinanceWithdrawAudit',
      component: '/finance-biz/withdraw-audit',
      meta: { title: 'biz.menu.finance.withdrawAudit', icon: 'ri:exchange-funds-line' }
    },
    {
      path: 'bill',
      name: 'BizFinanceBill',
      component: '/finance-biz/bill',
      meta: { title: 'biz.menu.finance.bill', icon: 'ri:bill-line' }
    },
    {
      path: 'invoice-audit',
      name: 'BizFinanceInvoiceAudit',
      component: '/finance-biz/invoice-audit',
      meta: { title: 'biz.menu.finance.invoiceAudit', icon: 'ri:receipt-line' }
    },
    {
      path: 'reconciliation',
      name: 'BizFinanceReconciliation',
      component: '/finance-biz/reconciliation',
      meta: { title: 'biz.menu.finance.reconciliation', icon: 'ri:scales-2-line' }
    }
  ]
}
