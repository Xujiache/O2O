/**
 * 业务通用类型定义
 *
 * @module types/business/common
 */

/** 通用 ID 类型（数据库 bigint 转字符串避免溢出） */
export type BizId = string | number

/** 业务排序方向 */
export type SortOrder = 'asc' | 'desc'

/** 业务列表请求基础参数 */
export interface BizListParams {
  page?: number
  pageSize?: number
  keyword?: string
  startTime?: string
  endTime?: string
  cityCode?: string
  sortField?: string
  sortOrder?: SortOrder
  [key: string]: unknown
}

/** 业务列表响应 */
export interface BizListResp<T> {
  records: T[]
  total: number
  page: number
  pageSize: number
}

/** 字典项 */
export interface DictItem {
  /** 字典 code（业务 key） */
  code: string
  /** 字典值 */
  value: string | number
  /** 中文标签 */
  label: string
  /** 英文标签 */
  labelEn?: string
  /** 是否启用 */
  enabled?: boolean
  /** 排序 */
  sort?: number
  /** 备注 */
  remark?: string
}

/** 字典分组 */
export interface DictGroup {
  /** 字典类型 code */
  type: string
  /** 字典类型名 */
  typeName: string
  /** 字典项 */
  items: DictItem[]
}

/** 权限码（菜单/按钮/接口三级） */
export interface Permission {
  code: string
  name: string
  type: 'menu' | 'button' | 'api'
  parentCode?: string
}

/** 角色 */
export interface Role {
  code: string
  name: string
  description?: string
  enabled: boolean
}

/** 菜单（动态路由生成器） */
export interface BizMenu {
  /** 菜单 code（与权限对应） */
  code: string
  /** 路由 path */
  path: string
  /** 路由 name */
  name: string
  /** i18n 标题 key */
  title: string
  /** 图标 iconify code */
  icon?: string
  /** 子菜单 */
  children?: BizMenu[]
  /** 是否在菜单中隐藏 */
  hidden?: boolean
  /** 缓存 */
  keepAlive?: boolean
  /** 排序 */
  sort?: number
}
