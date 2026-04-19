/**
 * 业务路由汇总
 *
 * @module router/modules/business
 */
import type { AppRouteRecord } from '@/types/router'
import { bizDashboardRoutes } from './dashboard-biz'
import { bizUserRoutes } from './user-biz'
import { bizMerchantRoutes } from './merchant'
import { bizRiderRoutes } from './rider'
import { bizOrderRoutes } from './order'
import { bizProductContentRoutes } from './product-content'
import { bizOpsRoutes } from './ops-biz'
import { bizFinanceRoutes } from './finance'
import { bizSystemRoutes } from './system-biz'
import { bizCsRiskRoutes } from './cs-risk'

export const businessRoutes: AppRouteRecord[] = [
  bizDashboardRoutes,
  bizUserRoutes,
  bizMerchantRoutes,
  bizRiderRoutes,
  bizOrderRoutes,
  bizProductContentRoutes,
  bizOpsRoutes,
  bizFinanceRoutes,
  bizSystemRoutes,
  bizCsRiskRoutes
]
