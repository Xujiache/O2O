/**
 * @file api/stat.ts
 * @stage P7/T7.39~T7.41 (Sprint 6)
 * @desc 数据统计 / 等级 / 奖惩 / 申诉
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type {
  RiderStatOverview,
  StatPoint,
  RiderLevelInfo,
  RewardItem,
  AppealParams
} from '@/types/biz'
import { get, post, genIdemKey } from '@/utils/request'

/** 数据概览 */
export function fetchStatOverview(query: {
  startDate: string
  endDate: string
}): Promise<RiderStatOverview> {
  return get('/rider/stat/overview', query as Record<string, unknown>, { silent: true })
}

/** 时序数据 */
export function fetchStatSeries(query: {
  metric: 'orderCount' | 'income' | 'onTimeRate' | 'goodRate'
  startDate: string
  endDate: string
}): Promise<StatPoint[]> {
  return get('/rider/stat/series', query as Record<string, unknown>, { silent: true })
}

/** 等级信息 */
export function fetchLevelInfo(): Promise<RiderLevelInfo> {
  return get<RiderLevelInfo>('/rider/level', {}, { silent: true })
}

/** 奖惩列表 */
export function fetchRewards(query: {
  type?: 1 | 2
  startDate?: string
  endDate?: string
}): Promise<RewardItem[]> {
  return get('/rider/rewards', query as Record<string, unknown>, { silent: true })
}

/** 提交申诉（7 天内） */
export function submitAppeal(payload: AppealParams): Promise<{ ok: true; appealNo: string }> {
  return post('/rider/rewards/appeal', payload, { idemKey: genIdemKey() })
}
