/**
 * @file api/staff.ts
 * @stage P6/T6.37 (Sprint 5)
 * @desc 子账号 CRUD + 角色分配
 * @author 单 Agent V2.0 (P6 商户端)
 */
import { get, post, put, del, genIdemKey } from '@/utils/request'
import type { SubAccount, PageResult } from '@/types/biz'

export function listStaff(params?: {
  shopId?: string
  role?: 'manager' | 'cashier' | 'staff'
  status?: 0 | 1
  page?: number
  pageSize?: number
}): Promise<PageResult<SubAccount>> {
  return get('/merchant/staff', params as unknown as Record<string, unknown>)
}

export function getStaff(id: string): Promise<SubAccount> {
  return get(`/merchant/staff/${id}`)
}

export interface StaffCreateParams {
  username: string
  password: string
  realName: string
  mobile: string
  role: 'manager' | 'cashier' | 'staff'
  shopIds: string[]
}

export function createStaff(payload: StaffCreateParams): Promise<SubAccount> {
  return post('/merchant/staff', payload, { idemKey: genIdemKey() })
}

export function updateStaff(
  id: string,
  patch: Partial<StaffCreateParams> & { status?: 0 | 1 }
): Promise<SubAccount> {
  return put(`/merchant/staff/${id}`, patch)
}

export function deleteStaff(id: string): Promise<{ ok: boolean }> {
  return del(`/merchant/staff/${id}`)
}

export function resetStaffPassword(id: string, newPassword: string): Promise<{ ok: boolean }> {
  return post(`/merchant/staff/${id}/password/reset`, { newPassword })
}
