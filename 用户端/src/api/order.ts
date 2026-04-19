/**
 * @file api/order.ts
 * @stage P5/T5.18, T5.27, T5.28 (Sprint 3/5)
 * @desc 订单 API：外卖下单 / 跑腿下单+预估 / 列表 / 详情 / 取消 / 确认 / 售后 / 投诉
 * @author 单 Agent V2.0
 */
import { get, post, request, genIdemKey } from '@/utils/request'
import type {
  OrderTakeout,
  OrderErrand,
  ErrandPriceParams,
  ErrandPriceResult,
  KeysetPageResult,
  AfterSale,
  Complaint
} from '@/types/biz'

/* ========== 外卖下单 ========== */
export interface CreateTakeoutParams {
  shopId: string
  addressId: string
  items: Array<{ productId: string; skuId: string; qty: number; spec?: Record<string, string> }>
  userCouponId?: string
  remark?: string
  /** 立即送达=immediate；预约时间 ISO */
  deliveryTime?: 'immediate' | string
  /** 餐具数量 */
  utensilCount?: number
  /** 发票抬头 ID */
  invoiceHeaderId?: string
  /** 是否使用余额支付：1 是 / 0 否 */
  useBalance?: 0 | 1
}

export function createTakeoutOrder(payload: CreateTakeoutParams): Promise<OrderTakeout> {
  return request({
    url: '/user/order/takeout',
    method: 'POST',
    data: payload,
    idemKey: genIdemKey()
  })
}

/** 下单优惠预算 */
export function previewDiscount(payload: {
  orderType: 1 | 2
  shopId?: string
  itemsAmount: string
  deliveryFee?: string
  userCouponIds?: string[]
}): Promise<{
  itemsAmount: string
  deliveryFee: string
  discountAmount: string
  payAmount: string
  couponDetails: Array<{ userCouponId: string; couponName: string; reduce: string }>
}> {
  return post('/me/discount-preview', payload)
}

/* ========== 跑腿下单 ========== */
export interface CreateErrandParams {
  serviceType: 1 | 2 | 3 | 4
  pickupAddress: {
    name: string
    mobile: string
    detail: string
    lng: number
    lat: number
  }
  deliveryAddress?: {
    name: string
    mobile: string
    detail: string
    lng: number
    lat: number
  }
  itemDescription?: string
  weight?: number
  insurance?: number
  budget?: string
  buyList?: string
  queuePlace?: string
  queueDuration?: number
  remark?: string
  expectedPickupAt?: string
  userCouponId?: string
}

export function previewErrandPrice(payload: ErrandPriceParams): Promise<ErrandPriceResult> {
  return post('/user/order/errand/price', payload)
}

export function createErrandOrder(payload: CreateErrandParams): Promise<OrderErrand> {
  return request({
    url: '/user/order/errand',
    method: 'POST',
    data: payload,
    idemKey: genIdemKey()
  })
}

/* ========== 订单列表 / 详情 ========== */
export interface OrderListParams {
  /** 0 全部 / 1 外卖 / 2 跑腿 */
  orderType?: 0 | 1 | 2
  /** 0 全部 / 进行中 / 待评价 / 已完成 / 售后；以 status 数组传入 */
  statusIn?: number[]
  /**
   * 是否已评价（仅 status=55 时生效）：0 未评价 / 1 已评价
   * 用于"待评价" Tab vs "已完成" Tab 数据区分（P5-REVIEW-01 R1）
   * 后端 P9 接 listOrders 服务端过滤；当前阶段前端调 listOrders 后再做客户端兜底过滤
   */
  isReviewed?: 0 | 1
  cursor?: string
  pageSize?: number
}

export function listOrders(
  params: OrderListParams
): Promise<KeysetPageResult<OrderTakeout | OrderErrand>> {
  return get('/me/orders', params as Record<string, unknown>)
}

export function getOrderDetail(orderNo: string): Promise<OrderTakeout | OrderErrand> {
  return get(`/me/orders/${orderNo}`)
}

/* ========== 订单操作 ========== */
export function cancelOrder(orderNo: string, reason: string): Promise<{ ok: boolean }> {
  return post(`/me/orders/${orderNo}/cancel`, { reason })
}

export function confirmOrder(orderNo: string): Promise<{ ok: boolean }> {
  return post(`/me/orders/${orderNo}/confirm`)
}

/** 催单 */
export function urgeOrder(orderNo: string): Promise<{ ok: boolean }> {
  return post(`/me/orders/${orderNo}/urge`)
}

/** 再来一单（返回购物车草稿，前端 add 后跳 checkout） */
export function reorder(orderNo: string): Promise<{
  shopId: string
  items: Array<{ productId: string; skuId: string; qty: number }>
}> {
  return post(`/me/orders/${orderNo}/reorder`)
}

/* ========== 售后 ========== */
export function applyAfterSale(payload: {
  orderNo: string
  reason: string
  refundAmount: string
  evidenceUrls?: string[]
  description?: string
}): Promise<AfterSale> {
  return post('/me/after-sales', payload)
}

export function listAfterSales(params?: {
  status?: number
  cursor?: string
  pageSize?: number
}): Promise<KeysetPageResult<AfterSale>> {
  return get('/me/after-sales', params as Record<string, unknown>)
}

export function getAfterSale(id: string): Promise<AfterSale> {
  return get(`/me/after-sales/${id}`)
}

export function applyArbitration(payload: {
  relatedNo: string
  /** 1 订单 / 2 售后 / 3 投诉 */
  relatedType: 1 | 2 | 3
  reason: string
  evidenceUrls?: string[]
}): Promise<{ id: string; status: number }> {
  return post('/me/arbitrations', payload)
}

/* ========== 投诉 ========== */
export function applyComplaint(payload: {
  orderNo: string
  /** 1 用户 / 2 商家 / 3 骑手 */
  targetType: 1 | 2 | 3
  reason: string
  evidenceUrls?: string[]
}): Promise<Complaint> {
  return post('/me/complaints', payload)
}
