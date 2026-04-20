/**
 * 骑手管理 API
 *
 * 路径对齐后端：
 *   AdminController         → /admin/riders
 *   AdminDispatchController → /admin/transfers, /admin/transfer/:id/audit
 *
 * @module api/business/rider
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizRider, RiderTrackPoint, BizId } from '@/types/business'

export const riderApi = {
  /** 入驻审核（骑手列表 + 审核状态筛选） */
  auditList: (params: BizListParams & { status?: number }) =>
    bizApi.get<BizListResp<BizRider>>('/riders', params as Record<string, unknown>),
  auditPass: (id: BizId, remark?: string) =>
    bizApi.post<void>(`/riders/${id}/audit`, { action: 'pass', remark }),
  auditReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/riders/${id}/audit`, { action: 'reject', reason }),
  /** 骑手列表 */
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizRider>>('/riders', params as Record<string, unknown>),
  /** 骑手详情（P9 待后端补 admin 级别详情接口） */
  detail: (id: BizId) =>
    bizApi.get<BizRider & { recentOrders: unknown[]; rewards: unknown[] }>(`/riders/${id}`),
  /** 骑手轨迹回放（P9 待后端补接口） */
  track: (id: BizId, params?: { startTs?: number; endTs?: number }) =>
    bizApi.get<RiderTrackPoint[]>(`/rider/${id}/track`, params as Record<string, unknown>),
  /** 转单审核列表 */
  transferAuditList: (params: BizListParams) =>
    bizApi.get<BizListResp<unknown>>('/transfers', params as Record<string, unknown>),
  transferPass: (id: BizId) => bizApi.post<void>(`/transfer/${id}/audit`, { action: 'pass' }),
  transferReject: (id: BizId, reason: string) =>
    bizApi.post<void>(`/transfer/${id}/audit`, { action: 'reject', remark: reason }),
  /** 奖惩规则（P9 待后端补 admin 控制器） */
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
  /** 批量发奖罚（P9 待后端补接口） */
  rewardBatch: (
    riderIds: BizId[],
    rule: { type: 'punish' | 'reward'; amount: string; reason: string }
  ) => bizApi.post<void>('/rider/reward/batch', { riderIds, ...rule }, { needSign: true }),
  /** 等级配置（P9 待后端补接口） */
  levelConfig: () =>
    bizApi.get<
      Array<{ level: number; name: string; condition: Record<string, unknown>; weight: number }>
    >('/rider/level/config'),
  updateLevelConfig: (config: unknown) =>
    bizApi.put<void>('/rider/level/config', config, { needSign: true }),
  /** 风控（复用骑手列表 + 状态筛选） */
  riskList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizRider>>('/riders', {
      ...params,
      status: 0
    } as Record<string, unknown>)
}
