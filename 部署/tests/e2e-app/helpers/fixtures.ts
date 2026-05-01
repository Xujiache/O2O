/**
 * APP E2E 测试数据
 * Sprint 4 / W4.E.2
 */

export interface OrderFixture {
  id: string
  shopId: string
  amount: number
  status: 'pending' | 'accepted' | 'preparing' | 'dispatching' | 'delivering' | 'delivered'
}

export interface RiderFixture {
  id: string
  name: string
  phone: string
}

export const PENDING_ORDER: OrderFixture = {
  id: 'order_e2e_pending_001',
  shopId: 'shop_e2e_001',
  amount: 56.0,
  status: 'pending'
}

export const ACCEPTED_ORDER: OrderFixture = {
  id: 'order_e2e_accepted_001',
  shopId: 'shop_e2e_001',
  amount: 56.0,
  status: 'accepted'
}

export const RIDER_DISPATCH_ORDER: OrderFixture = {
  id: 'order_e2e_dispatch_001',
  shopId: 'shop_e2e_001',
  amount: 56.0,
  status: 'dispatching'
}

export const DEFAULT_RIDER: RiderFixture = {
  id: 'rider_e2e_001',
  name: 'E2E 骑手',
  phone: '13900000001'
}

export const SCHEMES = {
  merchant: process.env.MERCHANT_SCHEME || 'o2omerchant',
  rider: process.env.RIDER_SCHEME || 'o2orider'
} as const
