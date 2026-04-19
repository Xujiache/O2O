/**
 * 系统管理 API（管理员/角色/权限/字典/日志/配置）
 * @module api/business/system
 */
import { bizApi } from './_request'
import type {
  BizListParams,
  BizListResp,
  BizAdmin,
  BizOperationLog,
  BizApiLog,
  DictGroup,
  Permission,
  Role,
  BizMenu,
  BizId
} from '@/types/business'

export const systemApi = {
  /** 字典：登录后拉一次全量缓存 */
  dictAll: () => bizApi.get<DictGroup[]>('/system/dict/all'),
  dictList: () => bizApi.get<DictGroup[]>('/system/dict/list'),
  dictSave: (data: Partial<DictGroup>) =>
    bizApi.post<{ id: BizId }>('/system/dict', data, { needSign: true }),
  dictUpdate: (type: string, data: Partial<DictGroup>) =>
    bizApi.put<void>(`/system/dict/${type}`, data, { needSign: true }),
  dictDelete: (type: string) => bizApi.del<void>(`/system/dict/${type}`),

  /** 权限菜单（登录后拉） */
  permissions: () =>
    bizApi.get<{ menus: BizMenu[]; permissions: string[]; roles: string[] }>('/system/permissions'),

  /** 管理员 CRUD */
  adminList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizAdmin>>('/system/admin/list', params as Record<string, unknown>),
  adminSave: (data: Partial<BizAdmin> & { password?: string }) =>
    bizApi.post<{ id: BizId }>('/system/admin', data, { needSign: true }),
  adminUpdate: (id: BizId, data: Partial<BizAdmin>) =>
    bizApi.put<void>(`/system/admin/${id}`, data, { needSign: true }),
  adminToggle: (id: BizId, enabled: boolean) =>
    bizApi.post<void>(`/system/admin/${id}/toggle`, { enabled }),
  adminAssignRoles: (id: BizId, roles: string[]) =>
    bizApi.post<void>(`/system/admin/${id}/roles`, { roles }, { needSign: true }),

  /** 角色 CRUD */
  roleList: (params: BizListParams) =>
    bizApi.get<BizListResp<Role>>('/system/role/list', params as Record<string, unknown>),
  roleSave: (data: Partial<Role>) =>
    bizApi.post<{ code: string }>('/system/role', data, { needSign: true }),
  roleUpdate: (code: string, data: Partial<Role>) =>
    bizApi.put<void>(`/system/role/${code}`, data, { needSign: true }),
  roleAssignPerms: (code: string, perms: string[]) =>
    bizApi.post<void>(`/system/role/${code}/perms`, { perms }, { needSign: true }),
  roleDelete: (code: string) => bizApi.del<void>(`/system/role/${code}`),

  /** 权限点 CRUD */
  permList: (params: BizListParams) =>
    bizApi.get<BizListResp<Permission>>(
      '/system/permission/list',
      params as Record<string, unknown>
    ),
  permSave: (data: Partial<Permission>) =>
    bizApi.post<{ code: string }>('/system/permission', data, { needSign: true }),
  permUpdate: (code: string, data: Partial<Permission>) =>
    bizApi.put<void>(`/system/permission/${code}`, data, { needSign: true }),
  permDelete: (code: string) => bizApi.del<void>(`/system/permission/${code}`),

  /** 操作日志 / API 日志 */
  operationLogList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizOperationLog>>(
      '/system/operation-log/list',
      params as Record<string, unknown>
    ),
  apiLogList: (params: BizListParams) =>
    bizApi.get<BizListResp<BizApiLog>>('/system/api-log/list', params as Record<string, unknown>),

  /** 系统配置 / APP 配置（JSON 可视化） */
  systemConfig: () => bizApi.get<Record<string, unknown>>('/system/system-config'),
  systemConfigUpdate: (data: Record<string, unknown>) =>
    bizApi.put<void>('/system/system-config', data, { needSign: true }),
  appConfig: () => bizApi.get<Record<string, unknown>>('/system/app-config'),
  appConfigUpdate: (data: Record<string, unknown>) =>
    bizApi.put<void>('/system/app-config', data, { needSign: true })
}
