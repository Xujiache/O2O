/**
 * @file api/stat.ts
 * @stage P6/T6.33 (Sprint 5)
 * @desc 数据统计 API：概览 / 销售趋势 / 商品销量榜 / 流量
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get } from '@/utils/request'
import type { StatOverview, StatPoint, StatSeries, ProductRankItem } from '@/types/biz'

/** 1 日 / 2 周 / 3 月 / 4 自定义 */
export type DateRangeType = 1 | 2 | 3 | 4

export interface StatQuery {
  shopId: string
  rangeType: DateRangeType
  startDate?: string
  endDate?: string
}

/** 统计概览 */
export function getStatOverview(params: StatQuery): Promise<StatOverview> {
  return get('/merchant/stat/overview', params as unknown as Record<string, unknown>)
}

/** 销售趋势（折线图） */
export function getSalesTrend(params: StatQuery): Promise<StatPoint[]> {
  return get('/merchant/stat/sales-trend', params as unknown as Record<string, unknown>)
}

/** 销售类目分布（饼图） */
export function getCategoryShare(params: StatQuery): Promise<{ name: string; value: number }[]> {
  return get('/merchant/stat/category-share', params as unknown as Record<string, unknown>)
}

/** 商品销量榜（柱状图） */
export function getProductRank(params: StatQuery & { topN?: number }): Promise<ProductRankItem[]> {
  return get('/merchant/stat/product-rank', params as unknown as Record<string, unknown>)
}

/** 流量分析 */
export function getTrafficStat(params: StatQuery): Promise<{
  uv: StatPoint[]
  pv: StatPoint[]
  conversionRate: StatSeries
}> {
  return get('/merchant/stat/traffic', params as unknown as Record<string, unknown>)
}
