/**
 * @file permission.ts
 * @stage P6/T6.5 (Sprint 1)
 * @desc 商户端权限校验工具：基于 RBAC 权限码 + 子账号角色
 *
 * 用法：
 *   - 编程：hasPerm('order:accept')
 *   - 模板：<BizBtn perm="order:accept" />（见 components/biz/BizBtn.vue）
 *
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { getStorage, setStorage, STORAGE_KEYS } from './storage'

/** 权限码全集（与后端 RBAC 表对齐；P6 仅列商户端常用） */
export const PERM = {
  /* 店铺 */
  SHOP_VIEW: 'shop:view',
  SHOP_EDIT: 'shop:edit',
  SHOP_TOGGLE: 'shop:toggle',
  SHOP_DELIVERY_AREA: 'shop:delivery-area',
  /* 订单 */
  ORDER_VIEW: 'order:view',
  ORDER_ACCEPT: 'order:accept',
  ORDER_REJECT: 'order:reject',
  ORDER_COOK: 'order:cook',
  ORDER_REFUND_AUDIT: 'order:refund-audit',
  ORDER_PRINT: 'order:print',
  /* 商品 */
  PRODUCT_VIEW: 'product:view',
  PRODUCT_EDIT: 'product:edit',
  PRODUCT_DELETE: 'product:delete',
  PRODUCT_TOGGLE: 'product:toggle',
  /* 财务 */
  FINANCE_VIEW: 'finance:view',
  FINANCE_WITHDRAW: 'finance:withdraw',
  FINANCE_INVOICE: 'finance:invoice',
  /* 数据统计 */
  STAT_VIEW: 'stat:view',
  /* 营销 */
  MARKETING_VIEW: 'marketing:view',
  MARKETING_EDIT: 'marketing:edit',
  /* 子账号 */
  STAFF_VIEW: 'staff:view',
  STAFF_EDIT: 'staff:edit',
  STAFF_DELETE: 'staff:delete'
} as const

export type PermCode = (typeof PERM)[keyof typeof PERM] | string

/** 角色 -> 权限码默认映射（仅前端兜底；权威以后端返回为准） */
export const ROLE_PERMS: Record<string, PermCode[]> = {
  /** 店长（全权） */
  manager: Object.values(PERM),
  /** 收银（订单+商品+财务） */
  cashier: [
    PERM.SHOP_VIEW,
    PERM.ORDER_VIEW,
    PERM.ORDER_ACCEPT,
    PERM.ORDER_REJECT,
    PERM.ORDER_COOK,
    PERM.ORDER_REFUND_AUDIT,
    PERM.ORDER_PRINT,
    PERM.PRODUCT_VIEW,
    PERM.FINANCE_VIEW,
    PERM.STAT_VIEW
  ],
  /** 店员（仅订单+商品上下架） */
  staff: [
    PERM.SHOP_VIEW,
    PERM.ORDER_VIEW,
    PERM.ORDER_ACCEPT,
    PERM.ORDER_COOK,
    PERM.ORDER_PRINT,
    PERM.PRODUCT_VIEW,
    PERM.PRODUCT_TOGGLE
  ]
}

/** 设置当前用户的权限码集合（登录成功后调用） */
export function setPermissions(perms: PermCode[]): void {
  setStorage(STORAGE_KEYS.PERMISSIONS, perms, 1000 * 60 * 60 * 24 * 7)
}

/** 读取当前用户权限码 */
export function getPermissions(): PermCode[] {
  return getStorage<PermCode[]>(STORAGE_KEYS.PERMISSIONS) ?? []
}

/**
 * 校验是否有指定权限
 * @param code 权限码
 * @returns 主账号始终 true；子账号按权限码校验
 */
export function hasPerm(code: PermCode): boolean {
  const perms = getPermissions()
  if (perms.length === 0) return true
  return perms.includes(code)
}

/** 校验是否有任一权限 */
export function hasAnyPerm(codes: PermCode[]): boolean {
  if (codes.length === 0) return true
  for (const c of codes) {
    if (hasPerm(c)) return true
  }
  return false
}

/** 校验是否有全部权限 */
export function hasAllPerm(codes: PermCode[]): boolean {
  if (codes.length === 0) return true
  for (const c of codes) {
    if (!hasPerm(c)) return false
  }
  return true
}
