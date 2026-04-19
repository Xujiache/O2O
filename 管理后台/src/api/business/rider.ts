/**
 * 骑手管理 API
 * @module api/business/rider
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizRider, RiderTrackPoint, BizId } from '@/types/business'

export const riderApi = {
  /** 入驻审核 */
  auditList: (params: BizListParams & { status?: number }) =>
    bizApi.get<BizListResp<BizRider>>('/rider/audit/list', params as Record<string, unknown>),
  auditPass: (id: BizId, remark?: string) =>
    bizApi.post<void>(`/rider/audit/${id}/pass`, { remark }),
  auditReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/rider/audit/${id}/reject`, { reason }),
  /** 骑手列表 */
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizRider>>('/rider/list', params as Record<string, unknown>),
  /** 骑手详情 */
  detail: (id: BizId) =>
    bizApi.get<BizRider & { recentOrders: unknown[]; rewards: unknown[] }>(`/rider/${id}`),
  /** 骑手轨迹回放 */
  track: (id: BizId, params?: { startTs?: number; endTs?: number }) =>
    bizApi.get<RiderTrackPoint[]>(`/rider/${id}/track`, params as Record<string, unknown>),
  /** 转单审核列表 */
  transferAuditList: (params: BizListParams) =>
    bizApi.get<BizListResp<unknown>>(
      '/rider/transfer-audit/list',
      params as Record<string, unknown>
    ),
  transferPass: (id: BizId) => bizApi.post<void>(`/rider/transfer-audit/${id}/pass`),
  transferReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/rider/transfer-audit/${id}/reject`, { reason }),
  /** 奖惩规则 */
  rewardRules: () =>
    bizApi.get<
      Array<{
        id: BizId
        type: 'punish' | 'reward'
        name: string
        threshold: number
        amount: string
        enabled: boolean
      }>
    >('/rider/reward/rules'),
  /** 批量发奖罚 */
  rewardBatch: (
    riderIds: BizId[],
    rule: { type: 'punish' | 'reward'; amount: string; reason: string }
  ) => bizApi.post<void>('/rider/reward/batch', { riderIds, ...rule }, { needSign: true }),
  /** 等级配置 */
  levelConfig: () =>
    bizApi.get<
      Array<{ level: number; name: string; condition: Record<string, unknown>; weight: number }>
    >('/rider/level/config'),
  updateLevelConfig: (config: unknown) =>
    bizApi.put<void>('/rider/level/config', config, { needSign: true }),
  /** 风控 */
  riskList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizRider>>('/rider/risk/list', params as Record<string, unknown>)
}
