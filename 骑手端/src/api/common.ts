/**
 * @file api/common.ts
 * @stage P7/T7.2 (Sprint 1)
 * @desc 系统通用 API：健康检查 / 服务城市列表 / 字典 / 导航 vendor 列表
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { get, rootGet } from '@/utils/request'

export interface HealthInfo {
  status: string
  info?: unknown
  details?: unknown
}

export function fetchHealth(): Promise<HealthInfo> {
  return rootGet<HealthInfo>('/health')
}

export interface CityItem {
  cityCode: string
  cityName: string
  level: 'province' | 'city' | 'district'
  parentCode?: string
}

export function fetchCityList(): Promise<CityItem[]> {
  return get<CityItem[]>('/common/cities', {}, { silent: true })
}

export interface DictItem {
  code: string
  label: string
  /** 关联额外数据 */
  extra?: Record<string, unknown>
}

export function fetchDict(group: string): Promise<DictItem[]> {
  return get<DictItem[]>('/common/dict', { group }, { silent: true })
}
