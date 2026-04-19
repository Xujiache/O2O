/**
 * 数据大盘 API
 * @module api/business/dashboard
 */
import { bizApi } from './_request'

export const dashboardApi = {
  /** 概览（V8.1 + V8.3） */
  overview: () => bizApi.get<DashboardOverview>('/dashboard/overview'),
  /** 趋势 */
  trend: (params: { period: 'day' | 'week' | 'month'; metric?: string }) =>
    bizApi.get<DashboardTrendItem[]>(
      '/dashboard/trend',
      params as unknown as Record<string, unknown>
    ),
  /** 运营 */
  ops: () => bizApi.get<DashboardOps>('/dashboard/ops'),
  /** 实时监控 */
  monitor: () => bizApi.get<DashboardMonitor>('/dashboard/monitor')
}

export interface DashboardOverview {
  kpi: {
    todayOrders: number
    todayAmount: string
    totalUsers: number
    totalMerchants: number
    onlineRiders: number
    deliveryRate: number
    pendingArbitration: number
    pendingMerchantAudit: number
  }
  trend: Array<{ hour: string; orders: number; amount: number }>
  topShops: Array<{ name: string; orders: number }>
  topProducts: Array<{ name: string; sales: number }>
  anomalyOrders: unknown[]
}

export interface DashboardTrendItem {
  ts: number | string
  orders: number
  amount: number
  users: number
  merchants: number
}

export interface DashboardOps {
  topShops: Array<{ name: string; orders: number }>
  topProducts: Array<{ name: string; sales: number }>
  topRiders: Array<{ name: string; orders: number; rating?: number }>
  cityDistribution: Array<{ city: string; count: number }>
  anomalyStat: { complaintCount: number; refundCount: number; arbitrationCount: number }
}

export interface DashboardMonitor {
  pendingArbitration: unknown[]
  pendingAudit: unknown[]
  anomalyOrders: unknown[]
  complaintNew: unknown[]
  riskHits: unknown[]
}
