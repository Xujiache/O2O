/**
 * 用户管理 API
 * @module api/business/user
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizUser, UserDetailExtra, BizId } from '@/types/business'

export const userApi = {
  /** 用户列表 */
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizUser>>('/user/list', params as Record<string, unknown>),
  /** 用户详情 */
  detail: (id: BizId) => bizApi.get<BizUser & UserDetailExtra>(`/user/${id}`),
  /** 封禁用户 */
  ban: (id: BizId, reason: string) =>
    bizApi.post<void>(`/user/${id}/ban`, { reason }, { needSign: true }),
  /** 解封 */
  unban: (id: BizId) => bizApi.post<void>(`/user/${id}/unban`, {}, { needSign: true }),
  /** 风控列表 */
  riskList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizUser>>('/user/risk/list', params as Record<string, unknown>),
  /** 加入黑名单 */
  addBlack: (id: BizId, reason: string) => bizApi.post<void>(`/user/risk/${id}/black`, { reason }),
  /** 移除黑名单 */
  removeBlack: (id: BizId) => bizApi.del<void>(`/user/risk/${id}/black`)
}
