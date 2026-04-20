/**
 * 用户管理 API
 *
 * 路径对齐后端 AdminController（@Controller('admin')）：
 *   users / blacklist
 *
 * @module api/business/user
 */
import { bizApi } from './_request'
import type { BizListParams, BizListResp, BizUser, UserDetailExtra, BizId } from '@/types/business'

export const userApi = {
  /** 用户列表 */
  list: (params: BizListParams) =>
    bizApi.get<BizListResp<BizUser>>('/users', params as Record<string, unknown>),
  /** 用户详情 */
  detail: (id: BizId) => bizApi.get<BizUser & UserDetailExtra>(`/users/${id}`),
  /** 封禁用户（status=0） */
  ban: (id: BizId) => bizApi.put<void>(`/users/${id}/status/0`, {}, { needSign: true }),
  /** 解封（status=1） */
  unban: (id: BizId) => bizApi.put<void>(`/users/${id}/status/1`, {}, { needSign: true }),
  /** 黑名单列表 */
  riskList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizUser>>('/blacklist', params as Record<string, unknown>),
  /** 加入黑名单 */
  addBlack: (id: BizId, reason: string) => bizApi.post<void>('/blacklist', { userId: id, reason }),
  /** 移除黑名单 */
  removeBlack: (id: BizId) => bizApi.del<void>(`/blacklist/${id}`)
}
